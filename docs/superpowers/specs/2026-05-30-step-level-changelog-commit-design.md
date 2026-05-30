# Step-Level Changelog & Commit Design

**Date:** 2026-05-30
**Status:** Approved
**Scope:** `scripts/ai-dev.sh`, all agent `instructions.md` files

---

## Overview

At the end of every pipeline step, the agent writes a structured JSON artifact (`.step-report.json`). The shell reads this artifact, executes a git commit, and posts a structured changelog comment to the parent Jira ticket. Both actions happen regardless of step success or failure, ensuring complete traceability.

---

## Architecture & Data Flow

```
cmd_* (ai-dev.sh)
  │
  ├─ run_agent (existing) ──► agent does its work
  │                           agent writes .step-report.json  ◄── NEW
  │
  ├─ validate_step_report()   jq validation guard             ◄── NEW
  │
  ├─ commit_step_changes()    git add + git commit            ◄── NEW
  │
  ├─ post_parent_changelog()  ADF comment → parent Jira       ◄── NEW
  │
  ├─ [existing gate checks]
  └─ [existing subtask transition]
```

The four new functions run after `run_agent` returns, before any existing gate logic. If `validate_step_report` fails, the step aborts without committing or posting to Jira.

The artifact path:

```
docs/features/{TICKET_ID}/.step-report.json
```

Overwritten each step — Jira comments serve as the durable log.

---

## Step-Report JSON Schema

```json
{
  "step": "code-impl",
  "status": "success | failure",
  "summary": "One sentence: what the agent produced or what failed",
  "files_changed": ["apps/order-service/src/controllers/order.controller.ts"],
  "validation": {
    "coverage": "84%",
    "lint_errors": 0,
    "type_errors": 0,
    "security_findings": 0,
    "perf_regressions": 0
  },
  "commit_message": "feat(order-service): scaffold controller and routes [SCRUM-42]"
}
```

**Rules:**

- `validation` fields are step-specific — only include what's relevant (e.g., `coverage` only for `code-test`)
- `commit_message` must be a valid Conventional Commit using the step-mapped type (see table below)
- On failure: `status = "failure"`, subject includes `[FAILED]`, e.g. `docs(requirements): [FAILED] SCRUM-42 requirements step checkpoint`
- `files_changed` lists only files the agent modified — shell cross-checks via `git diff --name-only`

**Validation guard (shell):**

```bash
jq -e '.step and .status and .summary and .commit_message' .step-report.json
```

Any required field missing → abort before commit or Jira call.

---

## Step-to-Commit-Type Mapping

| Step          | Commit Type | Scope        | Example                                                |
| ------------- | ----------- | ------------ | ------------------------------------------------------ |
| requirements  | `docs`      | ticket ID    | `docs(SCRUM-42): requirements checkpoint`              |
| design        | `docs`      | ticket ID    | `docs(SCRUM-42): design checkpoint`                    |
| code-impl     | `feat`      | service name | `feat(order-service): scaffold controller [SCRUM-42]`  |
| code-test     | `test`      | service name | `test(order-service): add controller specs [SCRUM-42]` |
| code-quality  | `refactor`  | service name | `refactor(order-service): quality pass [SCRUM-42]`     |
| code-security | `security`  | service name | `security(order-service): harden endpoints [SCRUM-42]` |
| code-perf     | `perf`      | service name | `perf(order-service): optimise query path [SCRUM-42]`  |
| validate      | `chore`     | ticket ID    | `chore(SCRUM-42): validate checkpoint`                 |
| deploy-pr     | `chore`     | ticket ID    | `chore(SCRUM-42): deploy-pr checkpoint`                |
| deploy-ship   | `chore`     | ticket ID    | `chore(SCRUM-42): deploy-ship checkpoint`              |

**Notes:**

- The agent writes `commit_message` in the JSON; the shell uses it verbatim
- Scope for code steps falls back to `git diff --name-only | grep apps/ | head -1` if agent omits it
- Failed commits keep the mapped type; Husky's regex still passes since the type prefix is valid
- `deploy-pr` already has agent-driven commit logic — the checkpoint commit runs after, skipped if nothing new is staged (`git diff --cached --quiet && skip`)

---

## Jira Parent Comment Format

Posted to the parent ticket (e.g., `SCRUM-42`) via the existing `jira_add_comment` function, targeting `TICKET_ID` instead of a subtask key.

```
┌─────────────────────────────────────────────────┐
│ 🔖 Step Checkpoint: code-impl [✅ SUCCESS]       │
├─────────────────────────────────────────────────┤
│ Summary                                         │
│   Scaffolded order-service controller, routes,  │
│   and DTOs with Zod validation                  │
│                                                 │
│ Files Changed (4)                               │
│   • apps/order-service/src/controllers/...      │
│   • apps/order-service/src/routes/...           │
│   • apps/order-service/src/dtos/...             │
│   • libs/shared-types/src/order.types.ts        │
│                                                 │
│ Validation                                      │
│   Coverage: 84% | Lint errors: 0                │
│                                                 │
│ Commit                                          │
│   feat(order-service): scaffold controller      │
│   [abc1234] • 2026-05-30 14:32 UTC             │
└─────────────────────────────────────────────────┘
```

**Implementation details:**

- Built as ADF using the existing `jira_add_comment` function
- Files list capped at 10 — shows first 9 + `• ...and N more` if exceeded
- On failure: header shows `❌ FAILED`, validation section shows error reason from `summary`
- Timestamp appended by the shell (`date -u`)
- On failure with `files_changed: []`: posts "No files modified"

---

## New Shell Functions

### `validate_step_report`

```bash
validate_step_report() {
  local report="$(feature_dir)/.step-report.json"
  [[ -f "$report" ]] || { log_error "step-report.json not found"; return 1; }
  jq -e '.step and .status and .summary and .commit_message' "$report" > /dev/null \
    || { log_error "step-report.json missing required fields"; return 1; }
}
```

### `commit_step_changes`

```bash
commit_step_changes() {
  local report="$(feature_dir)/.step-report.json"
  local msg; msg=$(jq -r '.commit_message' "$report")
  git add -A
  git diff --cached --quiet && { log_info "Nothing staged, skipping commit"; return 0; }
  git commit -m "$msg"
}
```

### `post_parent_changelog`

```bash
post_parent_changelog() {
  local report="$(feature_dir)/.step-report.json"
  # Reads step, status, summary, files_changed, validation, commit_message
  # Builds ADF document and calls jira_add_comment "$TICKET_ID" "$adf_payload"
}
```

---

## Step-Report Generation: Agent vs Shell

Two categories of steps:

**Agent-driven steps** (agent writes `.step-report.json` as its final action):
`requirements`, `design`, `code-impl`, `code-test`, `code-quality`, `code-security`, `code-perf`, `deploy-pr`

**Shell-driven steps** (shell generates `.step-report.json` directly from check results):
`validate`, `deploy-ship` — these steps run checks/deployments without delegating to an agent; the shell constructs the report from exit codes, CDK output, and smoke test results.

## Agent Instruction Additions

Each agent-driven step's `instructions.md` gets a final section:

```markdown
## Final Step: Write Step Report

After completing all work, write the following JSON to
`docs/features/{TICKET_ID}/.step-report.json`:

{
"step": "<step-name>",
"status": "success" or "failure",
"summary": "<one sentence>",
"files_changed": ["<path>", ...],
"validation": { <step-relevant fields only> },
"commit_message": "<conventional-commit> [TICKET_ID]"
}

Use commit type: <mapped type for this step> (see table in design doc).
If the step failed, set status to "failure" and include [FAILED] in commit_message subject.
Do not include validation fields that are not relevant to this step.
```

---

## Error Handling

| Scenario                                            | Behaviour                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Agent doesn't write `.step-report.json`             | Shell aborts — no commit, no Jira post                             |
| JSON is malformed                                   | `jq` guard fails → abort, error logged                             |
| `git commit` fails (nothing staged, hook rejection) | Shell logs warning, skips commit — Jira post still runs            |
| Jira parent comment POST fails                      | Shell logs warning, does **not** abort the step                    |
| `deploy-pr` double-commit scenario                  | `git diff --cached --quiet` guard skips if nothing new             |
| `files_changed: []` (no modifications)              | Commit skipped, Jira comment posts with "No files modified"        |
| `deploy-ship` (infra-only)                          | Commit skipped, Jira comment includes CDK stack names in `summary` |

**Invariant:** A Jira comment failure never blocks the pipeline. The commit is the durable checkpoint; Jira is observability on top.

---

## Files to Modify

| File                                         | Change                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `scripts/ai-dev.sh`                          | Add `validate_step_report`, `commit_step_changes`, `post_parent_changelog`; wire into all `cmd_*` functions after `run_agent` |
| `agents/requirements-agent/instructions.md`  | Add final step-report section                                                                                                 |
| `agents/design-agent/instructions.md`        | Add final step-report section                                                                                                 |
| `agents/code-impl-agent/instructions.md`     | Add final step-report section                                                                                                 |
| `agents/code-test-agent/instructions.md`     | Add final step-report section                                                                                                 |
| `agents/code-quality-agent/instructions.md`  | Add final step-report section                                                                                                 |
| `agents/code-security-agent/instructions.md` | Add final step-report section                                                                                                 |
| `agents/code-perf-agent/instructions.md`     | Add final step-report section                                                                                                 |
| `agents/deploy-agent/instructions.md`        | Add final step-report section (deploy-pr only)                                                                                |
| `scripts/ai-dev.sh` (validate + deploy-ship) | Shell generates `.step-report.json` directly from check results — no agent involved                                           |
