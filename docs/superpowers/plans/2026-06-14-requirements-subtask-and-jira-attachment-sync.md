# Requirements Subtask + Jira Attachment Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `init` to create a proper `requirements` subtask in Jira (not map it to the parent ticket), and update `design` to download the PO-approved `requirements.md` attachment from Jira before running, overwriting the local copy.

**Architecture:** Three-step change — (1) add `downloadAttachment` to `JiraClient`, (2) fix `init` to include `requirements` in normal subtask creation, (3) update `design` to pull the PO-approved attachment from Jira and write it locally before proceeding.

**Tech Stack:** TypeScript, Jira REST API v3, Node.js `fetch`, Jest + ts-jest (ESM)

---

## File Map

| File                                                   | Change                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `scripts/ai-dev/types.ts`                              | Add `JiraAttachment` interface; add `attachment?` field to `JiraIssue.fields` |
| `scripts/ai-dev/clients/jira-client.ts`                | Add `downloadAttachment(issueKey, filename): Promise<string>`                 |
| `scripts/ai-dev/steps/init.ts`                         | Remove requirements→parent-ticket hack; create requirements as a real subtask |
| `scripts/ai-dev/steps/design.ts`                       | Replace local file read with Jira attachment download + local overwrite       |
| `scripts/ai-dev/__tests__/clients/jira-client.test.ts` | Add `downloadAttachment` unit tests                                           |

---

### Task 1: Add `JiraAttachment` type

**Files:**

- Modify: `scripts/ai-dev/types.ts`

- [ ] **Step 1: Add `JiraAttachment` interface and update `JiraIssue.fields`**

In `scripts/ai-dev/types.ts`, add `JiraAttachment` before `JiraIssue`, and add `attachment?` to `JiraIssue.fields`:

```typescript
export interface JiraAttachment {
  id: string;
  filename: string;
  content: string; // download URL
  mimeType: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
    };
    project: {
      key: string;
    };
    issuetype: {
      id: string;
      name: string;
    };
    attachment?: JiraAttachment[]; // ← add this
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ai-dev/types.ts
git commit -m "feat(ai-dev): add JiraAttachment type to support attachment download"
```

---

### Task 2: Add `downloadAttachment` to `JiraClient`

**Files:**

- Modify: `scripts/ai-dev/clients/jira-client.ts`
- Test: `scripts/ai-dev/__tests__/clients/jira-client.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `describe('JiraClient')` block in `scripts/ai-dev/__tests__/clients/jira-client.test.ts`, after the existing `uploadAttachment` describe block:

```typescript
describe('downloadAttachment', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should download attachment content by filename', async () => {
    const mockIssue = {
      id: '10001',
      key: 'TEST-123',
      fields: {
        summary: 'Test',
        status: { name: 'Done' },
        issuetype: { name: 'Subtask' },
        project: { key: 'TEST' },
        attachment: [
          {
            id: 'att-1',
            filename: 'requirements.md',
            content:
              'https://test.atlassian.net/secure/attachment/1/requirements.md',
            mimeType: 'text/markdown',
          },
        ],
      },
    };
    mockRequest.mockResolvedValue({ data: mockIssue });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('# Requirements\n\nSome content'),
    });

    const result = await client.downloadAttachment(
      'TEST-123',
      'requirements.md'
    );

    expect(result).toBe('# Requirements\n\nSome content');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test.atlassian.net/secure/attachment/1/requirements.md',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic '),
        }),
      })
    );
  });

  it('should throw when attachment not found', async () => {
    const mockIssue = {
      id: '10001',
      key: 'TEST-123',
      fields: {
        summary: 'Test',
        status: { name: 'Done' },
        issuetype: { name: 'Subtask' },
        project: { key: 'TEST' },
        attachment: [],
      },
    };
    mockRequest.mockResolvedValue({ data: mockIssue });

    await expect(
      client.downloadAttachment('TEST-123', 'requirements.md')
    ).rejects.toThrow("Attachment 'requirements.md' not found on TEST-123");
  });

  it('should throw when attachment has no attachments field', async () => {
    const mockIssue = {
      id: '10001',
      key: 'TEST-123',
      fields: {
        summary: 'Test',
        status: { name: 'Done' },
        issuetype: { name: 'Subtask' },
        project: { key: 'TEST' },
      },
    };
    mockRequest.mockResolvedValue({ data: mockIssue });

    await expect(
      client.downloadAttachment('TEST-123', 'requirements.md')
    ).rejects.toThrow("Attachment 'requirements.md' not found on TEST-123");
  });

  it('should throw when download request fails', async () => {
    const mockIssue = {
      id: '10001',
      key: 'TEST-123',
      fields: {
        summary: 'Test',
        status: { name: 'Done' },
        issuetype: { name: 'Subtask' },
        project: { key: 'TEST' },
        attachment: [
          {
            id: 'att-1',
            filename: 'requirements.md',
            content:
              'https://test.atlassian.net/secure/attachment/1/requirements.md',
            mimeType: 'text/markdown',
          },
        ],
      },
    };
    mockRequest.mockResolvedValue({ data: mockIssue });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      statusText: 'Forbidden',
    });

    await expect(
      client.downloadAttachment('TEST-123', 'requirements.md')
    ).rejects.toThrow('Failed to download attachment: Forbidden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scripts/ai-dev && npm test -- --testPathPattern="jira-client" 2>&1 | tail -20
```

Expected: FAIL — `client.downloadAttachment is not a function`

- [ ] **Step 3: Implement `downloadAttachment` in `JiraClient`**

Add this method to `scripts/ai-dev/clients/jira-client.ts` after the `uploadAttachment` method (before `getTransitions`):

```typescript
async downloadAttachment(issueKey: string, filename: string): Promise<string> {
  Logger.debug(`Downloading attachment '${filename}' from ${issueKey}`);

  const issue = await this.request<JiraIssue>(
    'GET',
    `/rest/api/3/issue/${issueKey}?fields=attachment`
  );

  const attachments = issue.fields.attachment ?? [];
  const attachment = attachments.find(a => a.filename === filename);

  if (!attachment) {
    throw new Error(`Attachment '${filename}' not found on ${issueKey}`);
  }

  const response = await fetch(attachment.content, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${this.credentials.email}:${this.credentials.apiToken}`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.statusText}`);
  }

  return response.text();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scripts/ai-dev && npm test -- --testPathPattern="jira-client" 2>&1 | tail -20
```

Expected: PASS — all `downloadAttachment` tests green

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-dev/clients/jira-client.ts scripts/ai-dev/__tests__/clients/jira-client.test.ts
git commit -m "feat(ai-dev): add downloadAttachment method to JiraClient"
```

---

### Task 3: Fix `init` to create requirements as a real subtask

**Files:**

- Modify: `scripts/ai-dev/steps/init.ts`

The current code has two problems:

1. Line 44 filters out `requirements` from `stepsToCreate`
2. Lines 81–87 save the parent ticket key as the requirements subtask key

- [ ] **Step 1: Remove the requirements filter and the parent-ticket mapping**

In `scripts/ai-dev/steps/init.ts`, change:

```typescript
// Skip 'requirements' as it's the first step
const stepsToCreate = STEPS_ORDERED.filter(step => step !== 'requirements');
```

to:

```typescript
const stepsToCreate = STEPS_ORDERED;
```

Then remove these lines entirely (lines 81–87):

```typescript
// Also save the requirements subtask (the parent ticket itself)
await saveSubtaskKey(ctx.repoRoot, ctx.ticketId, 'requirements', ctx.ticketId);
```

- [ ] **Step 2: Run the full test suite to check for regressions**

```bash
cd scripts/ai-dev && npm test 2>&1 | tail -30
```

Expected: PASS — no failures introduced

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev/steps/init.ts
git commit -m "fix(ai-dev): create requirements as a real Jira subtask instead of mapping to parent ticket"
```

---

### Task 4: Update `design` to download PO-approved requirements from Jira

**Files:**

- Modify: `scripts/ai-dev/steps/design.ts`

The current code at lines 46–53 reads the local file. Replace it with a Jira attachment download that also overwrites the local file.

- [ ] **Step 1: Update imports in `design.ts`**

The file already imports `getSubtaskKey` and `writeFileWithDir`. Verify both are in the import from `../core/file-helpers.js`. Current imports are:

```typescript
import {
  getSubtaskKey,
  featureDir,
  writeFileWithDir,
  readFileIfExists,
} from '../core/file-helpers.js';
```

`readFileIfExists` is no longer needed for requirements (though keep it if used elsewhere in the file). It is not used elsewhere — remove it:

```typescript
import {
  getSubtaskKey,
  featureDir,
  writeFileWithDir,
} from '../core/file-helpers.js';
```

- [ ] **Step 2: Replace the local file read with Jira attachment download**

In `scripts/ai-dev/steps/design.ts`, replace the requirements-reading block (lines 46–53):

```typescript
// Read requirements for context
const requirementsPath = join(
  config.featureDocsDir,
  ctx.ticketId,
  'requirements.md'
);
const requirements = await readFileIfExists(requirementsPath);
if (!requirements) {
  throw new Error(
    'Requirements file not found. Did you run requirements step?'
  );
}
```

with:

```typescript
// Get requirements subtask key
const reqSubtaskKey = await getSubtaskKey(
  ctx.repoRoot,
  ctx.ticketId,
  'requirements'
);
if (!reqSubtaskKey) {
  throw new Error('Requirements subtask not found. Did you run init?');
}

// Download PO-approved requirements.md from Jira and sync locally
const requirementsPath = join(
  config.featureDocsDir,
  ctx.ticketId,
  'requirements.md'
);
Logger.info('Downloading PO-approved requirements.md from Jira...');
const requirements = await jira.downloadAttachment(
  reqSubtaskKey,
  'requirements.md'
);
await writeFileWithDir(requirementsPath, requirements);
Logger.success('requirements.md synced from Jira (local copy updated)');
```

- [ ] **Step 3: Run full test suite**

```bash
cd scripts/ai-dev && npm test 2>&1 | tail -30
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-dev/steps/design.ts
git commit -m "feat(ai-dev): design step downloads PO-approved requirements.md from Jira before running"
```

---

## Self-Review

**Spec coverage:**

- ✅ `init` creates requirements as a proper subtask — Task 3
- ✅ `requirements` step uploads `requirements.md` to that subtask — already works; the upload target was already `subtaskKey`, now correctly points to the real requirements subtask
- ✅ PO marks requirements subtask Done manually — no code change needed (Jira UI)
- ✅ `design` downloads latest attachment from requirements subtask — Task 4
- ✅ Local `requirements.md` overwritten with PO-approved version — Task 4 (`writeFileWithDir`)
- ✅ Types updated to support attachment field — Task 1
- ✅ Tests for `downloadAttachment` — Task 2

**Placeholder scan:** None found — all steps have concrete code.

**Type consistency:**

- `JiraAttachment` defined in Task 1, used in `jira-client.ts` Task 2 — consistent
- `downloadAttachment(issueKey: string, filename: string): Promise<string>` — signature matches usage in Task 4
- `writeFileWithDir` already imported and used correctly in existing design.ts
