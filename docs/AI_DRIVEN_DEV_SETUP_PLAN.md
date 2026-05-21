# AI-Driven Development Setup Plan — OrderFlow

> **Project context:** Phases 0–10 of the master plan are complete. This is an entirely new layer on top
> of the existing repo — AI tooling infrastructure, not feature work.

---

## Table of Contents

1. [Phase A — Project Brain (Claude Context Layer)](#phase-a--project-brain-claude-context-layer)
2. [Phase B — Agent Infrastructure](#phase-b--agent-infrastructure)
3. [Phase C — MCP Configuration](#phase-c--mcp-configuration)
4. [Phase D — LLM Security in CI/CD](#phase-d--llm-security-in-cicd)
5. [Phase E — Operator Script](#phase-e--operator-script-ties-it-all-together)
6. [Execution Order & Priority](#execution-order--priority)
7. [What You Get After Each Phase](#what-you-get-after-each-phase)

---

## Phase A — Project Brain (Claude Context Layer)

_Estimated effort: 1–2 hours | No AWS needed | Zero risk_

### A.1 — Create `.claudeignore` at repo root

**Why first:** Prevents every subsequent Claude session from wasting tokens reading `node_modules/`,
`.nx/`, `cdk.out/` etc.

**File:** `.claudeignore`

```
node_modules/
dist/
build/
cdk.out/
coverage/
.nx/
.angular/
*.env
*.env.*
*.log
*.sqlite
tmp/
```

---

### A.2 — Create root `CLAUDE.md`

**Why:** Every Claude session in this repo automatically loads this — it's the "project brain". Without
it, Claude doesn't know the tech stack, standards, or domain rules.

**File:** `CLAUDE.md`

Key sections to include (based on what already exists in this project):

- Architecture: Nx monorepo, ECS Fargate, SQS+EventBridge, Angular 18 frontend
- Language standards: Node 22, TypeScript strict, Express 4.x, Zod validation
- Existing libs: `@orderflow/logger`, `@orderflow/auth`, `@orderflow/event-schemas`, `@orderflow/http-client`
- Code standards: OWASP Top 10, Conventional Commits, 80% test coverage gate
- Forbidden: `aws-sdk v2` (already in deps — flag this!), `any` type, force push
- Compaction protection block

---

### A.3 — Create per-service `CLAUDE.md` files

**Why:** When Claude works inside `apps/order-service/`, it loads the service-scoped file automatically
— domain rules, DB schema, SQS topics, local dev commands.

**Files needed:**

**`apps/order-service/CLAUDE.md`**

- Domain: orders CRUD, auth (register/login/delete), idempotency keys, audit trail
- DB: Prisma + PostgreSQL, schema location, migration commands
- Events: publishes `OrderCreated`, `OrderStatusChanged` to EventBridge
- Local dev: `docker compose up`, `npm run dev`

**`apps/notification-svc/CLAUDE.md`**

- Domain: SQS consumer, Socket.IO WebSocket push
- Consumes: `OrderCreated`, `OrderStatusChanged` from SQS
- Local dev commands

**`apps/web/CLAUDE.md`**

- Angular 18, NgRx Signal Store, `@orderflow/*` shared libs usage
- 3 screens: Login, Order List, Order Detail
- API base: proxied via `/v1` in dev

**`infra/CLAUDE.md`**

- CDK TypeScript stacks, environments config
- Stack names, existing stacks list
- `npm run cdk:diff` before any changes

---

### A.4 — Create global `~/.claude/CLAUDE.md`

**Why:** Machine-level rules that apply across ALL your projects, not just this repo.

```markdown
# Global Claude Rules

## Commit Format

Always use Conventional Commits: feat:, fix:, chore:, docs:, test:

## Branch Naming

feature/TICKET-short-desc | fix/TICKET-desc | hotfix/desc

## Test Runner

npm test (Nx workspace — runs Jest via nx run-many)

## IMPORTANT: Never auto-run

Never run `git push --force`, `npm publish`, `cdk deploy` without explicit confirmation
```

---

## Phase B — Agent Infrastructure

_Estimated effort: 2–3 hours | No AWS needed | Moderate complexity_

### B.1 — Create `.cloud/permissions.yaml`

**Why:** Hard-stops on destructive operations that apply to ALL agents. These are guardrails enforced at
the system level — Claude cannot override these.

**File:** `.cloud/permissions.yaml`

```yaml
deny:
  - pattern: 'git push --force'
    reason: 'Force push blocked — branch protection enforced'
  - pattern: 'cdk destroy'
    reason: 'Infrastructure destruction requires manual approval'
  - pattern: 'DROP TABLE'
    reason: 'Destructive DB operations blocked in agents'
  - pattern: 'rm -rf'
    reason: 'Recursive deletion blocked'
  - pattern: 'process.env.*=*'
    reason: 'Env var mutation blocked'

allow_with_confirmation:
  - pattern: 'cdk deploy'
    reason: 'Require human to confirm before deploying infra'
  - pattern: 'prisma migrate deploy'
    reason: 'Require human to confirm before running migrations'
```

---

### B.2 — Create Orchestrator agent

**File:** `agents/orchestrator/instructions.md`

This is the entry point for any autonomous task. Structure:

```
1. Read ticket/issue from input variable
2. Check .cloud/permissions.yaml
3. Call design-agent  → wait → verify TDD.md created
4. Call code-agent    → wait → verify tests pass
5. Call test-agent    → wait → verify coverage threshold
6. Call deploy-agent  → open PR with correct labels
7. Post summary to Slack (if MCP configured)
```

---

### B.3 — Create sub-agent instruction files

Each is a focused, constrained `instructions.md`:

**`agents/design-agent/instructions.md`** — model: `claude-sonnet`

- Input: ticket description
- Output: `docs/features/{TICKET_ID}/TDD.md` with Mermaid diagrams, API contract, DB changes
- Tools allowed: read files, write docs only
- Tools forbidden: git, cdk, npm

**`agents/code-agent/instructions.md`** — model: `claude-sonnet`

- Input: TDD.md path
- Output: implementation + failing tests fixed
- Must follow: CLAUDE.md standards, existing patterns in the codebase
- Run `npm run lint` and `npm test` before finishing

**`agents/test-agent/instructions.md`** — model: `claude-sonnet`

- Input: changed files list
- Output: additional tests to reach 80% coverage threshold
- Write unit tests only — no integration tests (those need Docker)

**`agents/deploy-agent/instructions.md`** — model: `claude-haiku` (cheapest — it's just scripting)

- Input: branch name, ticket ID, changed files
- Output: PR opened via GitHub MCP with correct labels, linked ticket, checklist

---

### B.4 — Create hooks

**`hooks/pre-tool.sh`** — runs before every agent tool call:

```bash
#!/bin/bash
# 1. Check for secret patterns in any file being written
# 2. Validate .cloud/permissions.yaml — deny blocked commands
# 3. Log audit trail: timestamp, agent, tool, file
```

**`hooks/post-tool.sh`** — runs after every agent tool call:

```bash
#!/bin/bash
# 1. Run eslint on any .ts file that was written
# 2. Verify no .env files were modified
# 3. Append to audit log
```

---

### B.5 — Create skills library

Reusable sub-tasks any agent can call:

**`skills/create-test-file/skill.md`**
Template for Jest test files in this project (imports, describe blocks, AAA pattern, mock patterns for
`@orderflow/logger`)

**`skills/generate-prisma-migration/skill.md`**
How to safely create Prisma migrations in this project

**`skills/update-changelog/skill.md`**
How to update `CHANGELOG.md` following Keep a Changelog format (already used in this project)

**`skills/open-pr/skill.md`**
PR creation using GitHub MCP with the existing PR template at `.github/PULL_REQUEST_TEMPLATE.md`

---

## Phase C — MCP Configuration

_Estimated effort: 1 hour | Needs API tokens_

### C.1 — Create `.mcp.json` at repo root

```json
{
  "mcpServers": {
    "github": { "...existing config..." },
    "aws-unified": { "...existing config..." },
    "jira": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-jira"],
      "env": {
        "JIRA_URL": "https://yourcompany.atlassian.net",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}"
      }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}"
      }
    }
  }
}
```

**Tokens needed:**

- Jira API token: `https://id.atlassian.com/manage-profile/security/api-tokens`
- Slack Bot token: Create app at `https://api.slack.com/apps`, add `chat:write` scope

> **Note:** Add `.mcp.json` to `.gitignore` if it contains references to secret env var names.

---

## Phase D — LLM Security in CI/CD

_Estimated effort: 1–2 hours | Needs Bedrock setup_

### D.1 — Enable Claude in AWS Bedrock

```
AWS Console → Bedrock → Model access → Request access:
  - anthropic.claude-sonnet-4-20250514-v1:0
  - anthropic.claude-opus-4-20250514-v1:0
```

### D.2 — Create IAM role for GitHub Actions → Bedrock

- OIDC trust policy for `repo:nilesh0604/f500:*`
- Permission: `bedrock:InvokeModel` on `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-*`
- Already have OIDC in `deploy-staging.yml` — extend the same role

### D.3 — Create VPC endpoint for Bedrock (recommended)

```
AWS Console → VPC → Endpoints
  Service: com.amazonaws.us-east-1.bedrock-runtime
  VPC: your existing orderflow VPC
```

Keeps all Claude API calls inside AWS private network — no data touches the public internet.

### D.4 — Add `llm-security-scan.yml` workflow

**File:** `.github/workflows/llm-security-scan.yml`

```yaml
name: LLM Security Review (Bedrock)

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read
  id-token: write

jobs:
  llm-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_BEDROCK_ROLE_ARN }}
          aws-region: us-east-1

      - name: Claude Security Review via Bedrock
        run: |
          DIFF=$(git diff origin/main...HEAD -- '*.ts' '*.js')
          # Call Bedrock with diff, parse findings
          # Fail on HIGH/CRITICAL
          # Post summary as PR comment via GitHub API
```

---

## Phase E — Operator Script (ties it all together)

_Estimated effort: 30 min_

### E.1 — Create `scripts/ai-dev.sh`

A single script you run to trigger the orchestrator for a given ticket:

```bash
#!/bin/bash
# Usage: ./scripts/ai-dev.sh JIRA-456
# Fetches Jira ticket, runs orchestrator headlessly

TICKET_ID="$1"

# Fetch ticket via Jira API (or Jira MCP)
TICKET_JSON=$(curl -s -H "Authorization: Bearer $JIRA_API_TOKEN" \
  "https://yourcompany.atlassian.net/rest/api/3/issue/$TICKET_ID")

# Run orchestrator
claude -p agents/orchestrator/instructions.md \
  --var TICKET_ID="$TICKET_ID" \
  --var TICKET_CONTEXT="$TICKET_JSON" \
  --var BRANCH="feature/$TICKET_ID" \
  --max-turns 30
```

---

## Execution Order & Priority

| #      | Step                            | File(s) Created | Effort | Prerequisite |
| ------ | ------------------------------- | --------------- | ------ | ------------ |
| **1**  | `.claudeignore`                 | 1 file          | 5 min  | None         |
| **2**  | Root `CLAUDE.md`                | 1 file          | 30 min | None         |
| **3**  | Per-service `CLAUDE.md` (×4)    | 4 files         | 45 min | Step 2       |
| **4**  | `~/.claude/CLAUDE.md`           | 1 file          | 10 min | None         |
| **5**  | `.cloud/permissions.yaml`       | 1 file          | 15 min | None         |
| **6**  | Orchestrator + sub-agents       | 5 files         | 60 min | Steps 2–5    |
| **7**  | Hooks + skills                  | 6 files         | 45 min | Step 6       |
| **8**  | `.mcp.json` + Jira/Slack tokens | 1 file          | 60 min | API tokens   |
| **9**  | Bedrock IAM role + model access | AWS setup       | 30 min | AWS access   |
| **10** | `llm-security-scan.yml`         | 1 file          | 30 min | Step 9       |
| **11** | `scripts/ai-dev.sh`             | 1 file          | 15 min | Steps 6+8    |

---

## What You Get After Each Phase

| After Phase         | What works                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **A** (Brain)       | Every Claude session in Windsurf instantly knows the full project context — no re-explaining stack, patterns, or standards |
| **B** (Agents)      | Can run `claude -p agents/orchestrator/instructions.md --var TICKET="..."` and get autonomous PR generation                |
| **C** (MCPs)        | Orchestrator can read Jira tickets itself and post Slack notifications — no manual copy-paste                              |
| **D** (Security CI) | Every PR gets AI security review via Bedrock — no code leaves your AWS VPC                                                 |
| **E** (Script)      | One command: `./scripts/ai-dev.sh JIRA-456` → PR opened autonomously                                                       |

---

## Status Tracking

- [x] A.1 — `.claudeignore`
- [x] A.2 — Root `CLAUDE.md`
- [x] A.3 — Per-service `CLAUDE.md` files (order-service, notification-svc, web, infra)
- [x] A.4 — Global `~/.claude/CLAUDE.md` (updated existing file)
- [x] B.1 — `.cloud/permissions.yaml`
- [x] B.2 — `agents/orchestrator/instructions.md`
- [x] B.3 — Sub-agent instruction files (design, code, test, deploy)
- [x] B.4 — `hooks/pre-tool.sh` + `hooks/post-tool.sh`
- [x] B.5 — Skills library (create-test-file, generate-prisma-migration, update-changelog, open-pr)
- [x] C.1 — `.mcp.json` with Jira + Slack MCPs
- [x] D.1 — AWS Bedrock model access enabled (Claude Sonnet 4.5 + Haiku 4.5 — AUTHORIZED)
- [x] D.2 — IAM role created: `orderflow-github-bedrock-role` (arn:aws:iam::947612421212:role/orderflow-github-bedrock-role)
- [ ] D.3 — VPC endpoint for Bedrock ⚠️ OPTIONAL — recommended for production
- [x] D.2b — Add `AWS_BEDROCK_ROLE_ARN` secret to GitHub repo
- [x] D.4 — `.github/workflows/llm-security-scan.yml`
- [x] E.1 — `scripts/ai-dev.sh`
