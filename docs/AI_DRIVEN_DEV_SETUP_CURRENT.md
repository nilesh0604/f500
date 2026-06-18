# AI-Driven Development Setup — Current State

> **Project context:** Phases 0–10 of the master plan are complete. This is an entirely new layer on top
> of the existing repo — AI tooling infrastructure, not feature work.
>
> **Related:** See [AI_DRIVEN_DEV_SETUP_FUTURE.md](./AI_DRIVEN_DEV_SETUP_FUTURE.md) for planned enhancements and gaps.

---

## Table of Contents

1. [Phase A — Project Brain (Claude Context Layer)](#phase-a--project-brain-claude-context-layer)
2. [Phase B — Agent Infrastructure](#phase-b--agent-infrastructure)
3. [Phase C — MCP Configuration](#phase-c--mcp-configuration)
4. [Phase D — LLM Security in CI/CD](#phase-d--llm-security-in-cicd)
5. [Phase E — Operator Script](#phase-e--operator-script-jira-backed-async-pipeline)
6. [Execution Order & Priority](#execution-order--priority)
7. [What You Get After Each Phase](#what-you-get-after-each-phase)
8. [Agentic Pipeline (10-Step Workflow)](#agentic-pipeline-10-step-workflow)
9. [Status Tracking](#status-tracking)

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
.turbo/
.serverless/
.terraform/
*.tfstate*
.localstack/
infra/node_modules/
```

---

### A.2 — Create root `CLAUDE.md`

**Why:** Every Claude session in this repo automatically loads this — it's the "project brain". Without
it, Claude doesn't know the tech stack, standards, or domain rules.

**File:** `CLAUDE.md`

Key sections to include (based on what already exists in this project):

- Architecture: Nx monorepo, ECS Fargate, SQS+EventBridge, Angular 18 frontend + Vyasa RAG (Lambda + Bedrock)
- Language standards: Node 22, TypeScript strict, Express 4.x, Zod validation
- Existing libs: `@orderflow/shared-types`, `@orderflow/event-schemas`, `@orderflow/logger`, `@orderflow/auth`, `@orderflow/http-client`, `@orderflow/testing-utils`
- Code standards: OWASP Top 10, Conventional Commits, 80% test coverage gate
- Forbidden: `aws-sdk v2` (already in deps — flag this!), `any` type, force push
- Compaction protection block
- Environment: Single `prod` environment (per ADR-011) — no dev/staging

**Status:** ✅ Updated — CLAUDE.md line 37 now correctly states "Environments: Single `prod` environment in `us-east-1`".

---

### A.3 — Create per-service `CLAUDE.md` files

**Why:** When Claude works inside a service directory, it loads the service-scoped file automatically
— domain rules, API contracts, local dev commands.

> **Note:** The original plan referenced `order-service`, `notification-svc`, and `web` —
> those apps were planned but not yet scaffolded. The actual apps in the repo are
> `vyasa-rag-service` and `vyasa-ui`.

**Files needed:**

**`apps/vyasa-rag-service/CLAUDE.md`** ✅ (exists)

- Domain: Agentic RAG service — ReAct loop, query planner, self-reflection
- Infra: Lambda + API Gateway, Bedrock KB (S3 Vectors), DynamoDB sessions
- Model: Amazon Nova Pro (`amazon.nova-pro-v1:0`)
- Local dev: `npm run dev` (Express wrapper), eval scripts

**`apps/vyasa-ui/CLAUDE.md`** ✅ (exists)

- React 18 + Vite + TailwindCSS chat interface
- SSE streaming support, session management sidebar
- Vite proxy `/api` → `vyasa-rag-service`
- Dev server on port 4201

**`infra/CLAUDE.md`** ✅ (exists)

- CDK TypeScript stacks, single `prod` environment config
- Stack names, existing stacks list
- `npm run cdk:diff` before any changes

**`apps/vyasa-slack-cmd/`** (exists, no `CLAUDE.md` yet)

- Slack slash command integration for Vyasa RAG
- Planned: create `apps/vyasa-slack-cmd/CLAUDE.md`

**Future (when scaffolded):**

- `apps/order-service/CLAUDE.md` — orders CRUD, Prisma + PostgreSQL, EventBridge
- `apps/notification-svc/CLAUDE.md` — SQS consumer, Socket.IO WebSocket push
- `apps/web/CLAUDE.md` — Angular 18, NgRx Signal Store, 3 screens

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
    reason: 'Force push blocked — branch protection enforced on main'
  - pattern: 'git push -f'
    reason: 'Force push blocked — branch protection enforced on main'
  - pattern: 'cdk destroy'
    reason: 'Infrastructure destruction requires manual approval outside agents'
  - pattern: 'DROP TABLE'
    reason: 'Destructive DB operations blocked in agent context'
  - pattern: 'DROP COLUMN'
    reason: 'Destructive DB migrations blocked — require human review'
  - pattern: 'rm -rf'
    reason: 'Recursive deletion blocked'
  - pattern: 'process.env.*='
    reason: 'Env var mutation blocked — use AWS Secrets Manager or SSM'
  - pattern: 'npm publish'
    reason: 'Package publishing requires manual human approval'
  - pattern: 'prisma migrate reset'
    reason: 'Database reset blocked — would destroy all data'

allow_with_confirmation:
  - pattern: 'cdk deploy'
    reason: 'Require human to confirm before deploying infrastructure'
  - pattern: 'prisma migrate deploy'
    reason: 'Require human to confirm before running DB migrations'
  - pattern: 'prisma db push'
    reason: 'Require human to confirm before schema push'
  - pattern: 'git push origin'
    reason: 'Confirm branch and target before pushing'
```

---

### B.2 — Create Orchestrator agent

**File:** `agents/orchestrator/instructions.md`

This is the entry point for any autonomous task. Current implementation is an 8-step pipeline:

```
1. Parse ticket (extract acceptance criteria, affected services)
2. Create feature branch
3. Call design-agent  → wait → verify TDD.md created
4. Call code-agent    → wait → verify lint + tests pass (max 2 retries)
5. Call test-agent    → wait → verify 80% coverage (max 1 retry)
6. Update changelog   → via skills/update-changelog/skill.md
7. Call deploy-agent  → open PR with correct labels
8. Report summary     → ticket, branch, PR URL, coverage, changed files
```

> **Evolution note:** The 5-Section Agentic Workflow (below) is the target architecture
> that adds a dedicated requirements analysis phase and human review gates. The
> current orchestrator will be updated to align with that model.
>
> **CLI note:** Agents are invoked via `runAgent()` in the TypeScript CLI (`scripts/ai-dev/cli.ts`) using valid
> `codemie-claude`/`claude` CLI flags (`-p --model --max-budget-usd --permission-mode`).
> Instructions are passed as the `-p` prompt argument. Permission bypass uses `--permission-mode bypassPermissions`.

---

### B.3 — Create sub-agent instruction files

Each is a focused, constrained `instructions.md`:

**`agents/design-agent/instructions.md`** ✅ — model: `claude-sonnet`

- Input: `requirements.md` path, ticket context
- Output: `docs/features/{TICKET_ID}/TDD.md` — API contract, DB schema, Mermaid sequence diagram, rollback plan, Spec Validation Checklist
- Brownfield context injection: `gatherBrownfieldContext()` in `scripts/ai-dev/steps/design.ts` pre-collects shared types, handler structure, service patterns, and error handling from existing code — injected as `{BROWNFIELD_CONTEXT}` variable (zero token cost for agent discovery)
- Tools allowed: read files, write docs only
- Tools forbidden: git, cdk, npm

**`agents/code-impl-agent/instructions.md`** ✅ — model: `claude-sonnet`, budget: `$3.00`

- Input: `TDD.md` path, `requirements.md` path
- Output: source files + `docs/features/{TICKET_ID}/IMPL_CHECKLIST.md` (all items ✅)
- Spec-driven TDD: failing test → implementation → refactor
- Gate: IMPL_CHECKLIST.md must exist with no ❌ before `code-test` unlocks

**`agents/code-test-agent/instructions.md`** ✅ — model: `claude-sonnet`, budget: `$2.00`

- Input: requirements.md, TDD.md, IMPL_CHECKLIST.md, changed files
- Output: spec-compliance tests; each AC tagged `// AC: <id>`
- Gate: 80% coverage (branches/functions/lines/statements) — auto-retries once

**`agents/code-quality-agent/instructions.md`** ✅ — model: `claude-sonnet`, budget: `$1.50`

- Invoked only when `eslint --fix + prettier --write` leave remaining errors
- Input: changed files, remaining error list
- Gate: ESLint + `tsc --noEmit` must pass before `code-security` unlocks

**`agents/code-security-agent/instructions.md`** ✅ — model: `claude-sonnet`, budget: `$1.50`

- Input: TDD.md, changed files, `npm audit` output
- Output: `docs/features/{TICKET_ID}/SECURITY_REVIEW.md` with `## Overall Verdict`
- Pre-flight: secrets pattern scan on `git diff` (blocks on hit); `npm audit` run before agent
- Gate: verdict must not be `FAIL` before `code-perf` unlocks

**`agents/code-perf-agent/instructions.md`** ✅ — model: `claude-sonnet`, budget: `$1.50`

- Input: TDD.md, changed files
- Output: N+1/cache review findings + E2E stubs for new API endpoints

**`agents/deploy-agent/instructions.md`** ✅ — model: `claude-sonnet`, budget: `$2.00`

- Input: branch name, ticket ID, changed files
- Output: PR opened via `gh` CLI with filled PR template, Conventional Commit title, correct labels

**`agents/ticket-creator/instructions.md`** ✅ — model: `claude-sonnet`, budget: `$1.00`

- Input: one-liner idea, project key
- Output: structured JSON between `---JSON_OUTPUT_START---` markers (summary, description, type, priority, labels)
- Used by `create` subcommand to generate detailed Jira tickets

**Fix agents** (all ✅, used by `deploy-ship` auto-dispatched and standalone `fix-*` subcommands):

| Agent                 | Model  | Budget | Trigger                                                               |
| --------------------- | ------ | ------ | --------------------------------------------------------------------- |
| `fix-lint-agent`      | haiku  | $1.00  | ESLint errors remain after `eslint --fix`                             |
| `fix-types-agent`     | haiku  | $1.00  | `tsc --noEmit` errors (max 2 attempts, warm-continue)                 |
| `fix-tests-agent`     | sonnet | $2.00  | Jest `FAIL` lines (max 2 attempts, spec as tiebreaker, warm-continue) |
| `fix-build-agent`     | sonnet | $2.00  | `npm run build` failures (max 2 attempts, warm-continue)              |
| `fix-security-agent`  | sonnet | $2.00  | HIGH/CRITICAL vulns after `npm audit fix`                             |
| `fix-conflicts-agent` | sonnet | $2.00  | ≤10 conflicted files after failed `git rebase`                        |

**No-Fabrication Guard** (cross-cutting, applied to all 6 code-writing agents):

Every code-writing agent (`code-impl`, `code-test`, `code-quality`, `code-security`, `code-perf`, `code-agent`) has a `## No Fabrication Rule` section in its `instructions.md`. Requires every file path, class name, namespace, and endpoint to trace to: (1) an existing file in the repo, (2) the approved TDD.md spec, or (3) a resolved design decision. Agents must report `status: blocked` if a reference cannot be found — prevents hallucinated imports and broken runtime errors.

**Legacy agents** (still present, not called by current pipeline):

- `agents/code-agent/instructions.md` — superseded by `code-impl-agent` + `code-test-agent`
- `agents/test-agent/instructions.md` — superseded by `code-test-agent`
- `agents/orchestrator/instructions.md` — superseded by TypeScript CLI (`scripts/ai-dev/`)
- `agents/requirements-agent/instructions.md` ✅ — active (called by `requirements` subcommand)

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

**`skills/create-test-file/skill.md`** ✅
Template for Jest test files in this project (imports, describe blocks, AAA pattern, mock patterns for
`@orderflow/logger`)

**`skills/generate-prisma-migration/skill.md`** ❌ (not created — Prisma not yet in active use)
How to safely create Prisma migrations in this project. Deferred until `order-service` is scaffolded.

**`skills/update-changelog/skill.md`** ✅
How to update `CHANGELOG.md` following Keep a Changelog format (already used in this project)

**`skills/open-pr/skill.md`** ✅
PR creation using GitHub MCP with the existing PR template at `.github/PULL_REQUEST_TEMPLATE.md`

---

## Phase C — MCP Configuration

_Estimated effort: 1 hour | Needs API tokens_

### C.1 — Create `.mcp.json` at repo root

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    },
    "aws-unified": {
      "command": "/Users/Nilesh_Shinde/.local/bin/uvx",
      "args": [
        "mcp-proxy-for-aws@latest",
        "https://aws-mcp.us-east-1.api.aws/mcp",
        "--metadata",
        "AWS_REGION=us-east-1"
      ],
      "env": {
        "AWS_PROFILE": "default",
        "READ_OPERATIONS_ONLY": "true"
      }
    },
    "jira": {
      "command": "npx",
      "args": ["-y", "mcp-jira-cloud"],
      "env": {
        "JIRA_BASE_URL": "${JIRA_BASE_URL}",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}",
        "JIRA_EMAIL": "${JIRA_EMAIL}"
      }
    },
    "langfuse": {
      "type": "sse",
      "url": "https://cloud.langfuse.com/api/public/mcp",
      "headers": {
        "Authorization": "Basic ${LANGFUSE_API_TOKEN}"
      }
    }
  }
}
```

> **Note:** AWS MCP uses `uvx` (uv package runner) instead of `npx`. Adjust path for non-Mac systems.

**Tokens needed:**

- GitHub PAT (`GITHUB_PERSONAL_ACCESS_TOKEN`): `https://github.com/settings/tokens`
- Jira API token + email (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`): `https://id.atlassian.com/manage-profile/security/api-tokens`
- Langfuse (`LANGFUSE_API_TOKEN`): Base64-encoded `pk:sk` from Langfuse project settings
- AWS: Profile configured via `aws configure` or SSO (`AWS_PROFILE`, `READ_OPERATIONS_ONLY`)

> **Note:** Slack MCP was originally planned but replaced by Langfuse MCP for RAG evaluation
> observability. Slack can be added later if notification integration is needed.

---

## Phase D — LLM Security in CI/CD

_Estimated effort: 1–2 hours | Needs Bedrock setup_

### D.1 — Enable Claude in AWS Bedrock

```
AWS Console → Bedrock → Model access → Request access:
  - us.anthropic.claude-sonnet-4-5-20250929-v1:0  (used in llm-security-scan.yml)
  - amazon.nova-pro-v1:0                          (used in vyasa-rag-service)
```

> **Note:** Claude Opus is available but not actively used. Amazon Nova Pro is the
> primary model for RAG inference due to no-approval-required access.

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

**File:** `.github/workflows/llm-security-scan.yml.disabled` (currently disabled)

> **Status:** Workflow created but disabled. Enable when ready to enforce AI security review on every PR.

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

## Phase E — Operator Script (Jira-Backed Async Pipeline)

_Estimated effort: 2 hours_

### E.1 — `scripts/ai-dev/` — TypeScript CLI (Migrated from Bash)

> **Status:** Migration complete. The original 3,109-line `scripts/ai-dev.sh` bash script has been migrated to a modular
> TypeScript CLI. The bash version is preserved as `scripts/ai-dev.sh.bak` (deprecated, can be removed).

An async pipeline where each step is independently triggered. State lives in Jira —
each pipeline step maps to a subtask under the parent ticket. Human approval = transitioning
the subtask to "Done" in the Jira UI.

#### CLI Invocation

```bash
# Development (no build needed):
npx tsx scripts/ai-dev/cli.ts <TICKET_ID> <command>

# Via npm script (recommended):
npm run ai-dev -- <TICKET_ID> <command>
```

#### Module Architecture

```
scripts/ai-dev/
├── cli.ts                    # Entry point — commander setup + dispatch
├── config.ts                 # Load ai-dlc.config.ts or defaults
├── types.ts                  # Shared types (StepName, Config, etc.)
│
├── clients/
│   ├── jira-client.ts        # Typed Jira REST API wrapper
│   ├── http.ts               # fetch wrapper with Basic auth header
│   ├── github.ts             # gh CLI wrapper
│   └── aws.ts                # aws CLI wrapper
│
├── core/
│   ├── agent-runner.ts       # runAgent() — read instructions, substitute vars, exec claude
│   ├── prerequisite.ts       # checkPrerequisite() — gating logic per step
│   ├── git.ts                # git operations
│   ├── file-helpers.ts       # featureDir(), subtasksFile(), markers
│   ├── ci-status.ts          # getCIStatus(), classifyCIFailure()
│   ├── logger.ts             # Colored console output
│   ├── shell.ts              # execSync wrapper
│   └── trivial-skip.ts       # shouldSkipExpensiveSteps() — skip test/security/perf for trivial changes
│
└── steps/
    ├── create.ts, init.ts, status.ts, help.ts
    ├── requirements.ts, resolve.ts, design.ts
    ├── code-impl.ts, code-test.ts, code-quality.ts, code-security.ts, code-perf.ts
    ├── code.ts (alias), validate.ts
    ├── deploy-pr.ts, deploy-ship.ts
    ├── release.ts, rollback.ts
    └── fix-lint.ts, fix-types.ts, fix-tests.ts, fix-build.ts, fix-security.ts, fix-conflicts.ts
```

**Agent invocation:** Uses the same `codemie-claude`/`claude` CLI but via Node.js `execSync`:

- Reads agent instructions file (Markdown)
- Substitutes `{KEY}` placeholders with `String.replaceAll()` (no `perl` needed)
- Invokes `$CLAUDE_CMD -p "$instructions" --model <model> --max-budget-usd <budget> --permission-mode bypassPermissions`

**Eliminated dependencies:** `jq`, `perl`, `curl`, `base64`, `awk`, `sed` — all replaced by Node.js native APIs.

**Budget allocation per agent** (source of truth: `scripts/ai-dev/config.ts`):

| Agent               | Model  | Budget | Rationale                                                |
| ------------------- | ------ | ------ | -------------------------------------------------------- |
| ticket-creator      | sonnet | $1.00  | Codebase analysis + structured JSON output               |
| requirements-agent  | sonnet | $1.50  | Deep reasoning on ambiguous requirements                 |
| design-agent        | sonnet | $2.00  | System interaction, Mermaid, API contract                |
| code-impl-agent     | sonnet | $3.00  | Spec-driven implementation + IMPL_CHECKLIST.md           |
| code-test-agent     | sonnet | $2.00  | Spec compliance tests; 80% coverage (1 retry)            |
| code-quality-agent  | sonnet | $1.50  | Residual lint/tsc errors after auto-fix                  |
| code-security-agent | sonnet | $1.50  | OWASP review → SECURITY_REVIEW.md                        |
| code-perf-agent     | sonnet | $1.50  | N+1/cache review + E2E stubs                             |
| deploy-agent        | sonnet | $2.00  | PR creation via `gh` CLI                                 |
| fix-lint-agent      | haiku  | $1.00  | ESLint residuals after auto-fix                          |
| fix-types-agent     | haiku  | $1.00  | TypeScript type errors (max 2 attempts, warm-continue)   |
| fix-tests-agent     | sonnet | $2.00  | Jest failures, spec as tiebreaker (max 2, warm-continue) |
| fix-build-agent     | sonnet | $2.00  | Build/compile errors (max 2 attempts, warm-continue)     |
| fix-security-agent  | sonnet | $2.00  | HIGH/CRITICAL vulns after `npm audit fix`                |
| fix-conflicts-agent | sonnet | $2.00  | ≤10 conflicted files after failed `git rebase`           |

**Configurable CLI:** Override `claudeCmd` in a custom `ai-dlc.config.ts` at repo root (default: `codemie-claude`). Set to `claude` to use raw Claude Code CLI.

**Subtask architecture (10 subtasks per ticket):**

```
Parent ticket: SCRUM-123
├── [AI] Requirements Analysis      → requirements.md (gated: human Done)
├── [AI] Technical Design           → TDD.md (gated: human Done)
├── [AI] Implementation: SCRUM-123     → IMPL_CHECKLIST.md (gated: human Done)
├── [AI] Spec Tests: SCRUM-123         → coverage report (gated: human Done)
├── [AI] Code Quality: SCRUM-123       → lint/tsc pass (gated: human Done)
├── [AI] Security Review: SCRUM-123    → SECURITY_REVIEW.md (gated: human Done)
├── [AI] Performance Review: SCRUM-123 → perf findings (gated: human Done)
├── [AI] Validate: SCRUM-123           → .validate-passed marker (gated: code-perf Done)
├── [AI] PR: SCRUM-123                 → PR opened, transitions to "In Review"
└── [AI] Ship: SCRUM-123               → CI green, transitions to "Done"
```

**Local state files** (stored in `docs/features/{TICKET_ID}/`):

| File                      | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `subtasks.json`           | step → Jira key mapping (source of truth for subtask IDs) |
| `.ticket-context`         | ticket context (read by agents if present)                |
| `.branch`                 | feature branch name (written by `init`)                   |
| `.ticket-summary`         | ticket summary text (written by `init`)                   |
| `.pr_number`              | PR number for `deploy-ship` and `release`                 |
| `.fix_retries.json`       | retry counter per failure type (max 3 before hard-block)  |
| `.last-known-good-commit` | rollback target written by `release` before CDK deploy    |
| `.validate-passed`        | marker touched by `validate` — gates `deploy-pr`          |
| `.questions-round`        | Q&A round counter for `resolve` multi-round loop          |

**Full subcommand reference:**

| Subcommand                | Agent                   | Model             | Budget | Rationale                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ----------------------- | ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create "idea"`           | `ticket-creator`        | Claude Sonnet 4.6 | $1.0   | Maps a vague one-liner to a structured Jira ticket (summary, description, ACs, story points) — requires creative reasoning                                                                                                                                                                                                  |
| `init SCRUM-123`          | — (script)              | —                 | —      | Deterministic: parses ticket via Jira API, creates 10 subtasks, creates git branch — no AI reasoning needed                                                                                                                                                                                                                 |
| `requirements SCRUM-123`  | `requirements-agent`    | Claude Sonnet 4.6 | $1.5   | Detects ambiguities, writes BDD-style acceptance criteria, generates clarifying questions — requires analytical reasoning                                                                                                                                                                                                   |
| `resolve SCRUM-123`       | — (script)              | —                 | —      | Pulls PO answers from Jira comments and patches requirements.md — deterministic text merge                                                                                                                                                                                                                                  |
| `design SCRUM-123`        | `design-agent`          | Claude Sonnet 4.6 | $2.0   | Plans TDD test structure, maps ACs to test cases, reasons about edge cases and mocking strategy                                                                                                                                                                                                                             |
| `code SCRUM-123`          | alias                   | —                 | —      | Chains code-impl → code-test → code-quality → code-security → code-perf (auto-approves each). **Trivial-skip:** Changes ≤10 lines on allowlisted files (`.md`, `.css`, `.json`, `.yaml`, `.toml`) with no security-sensitive paths and passing `tsc --noEmit` skip test/security/perf steps — saves ~$8+ per trivial change |
| `code-impl SCRUM-123`     | `code-impl-agent`       | Claude Sonnet 4.6 | $3.0   | Highest budget — generates multi-file implementation per CLAUDE.md conventions, produces IMPL_CHECKLIST.md                                                                                                                                                                                                                  |
| `code-test SCRUM-123`     | `code-test-agent`       | Claude Sonnet 4.6 | $2.0   | Writes spec tests targeting 80% branch/line coverage; must reason about async patterns and edge cases                                                                                                                                                                                                                       |
| `code-quality SCRUM-123`  | `code-quality-agent`    | Claude Sonnet 4.6 | $1.5   | Reviews residual ESLint/tsc errors after auto-fix pass; non-trivial fixes require judgment                                                                                                                                                                                                                                  |
| `code-security SCRUM-123` | `code-security-agent`   | Claude Sonnet 4.6 | $1.5   | OWASP Top 10 + SOC 2 review — must reason about injection vectors, auth gaps, PII exposure                                                                                                                                                                                                                                  |
| `code-perf SCRUM-123`     | `code-perf-agent`       | Claude Sonnet 4.6 | $1.5   | Detects N+1 queries, unnecessary re-renders, missing indexes; generates E2E performance stubs                                                                                                                                                                                                                               |
| `validate SCRUM-123`      | — (script)              | —                 | —      | CI dry-run: runs lint / tsc / jest / build / npm audit sequentially — no AI needed                                                                                                                                                                                                                                          |
| `deploy-pr SCRUM-123`     | `deploy-agent`          | Claude Sonnet 4.6 | $2.0   | Crafts PR description, applies branch-naming convention, pushes branch, opens GitHub PR                                                                                                                                                                                                                                     |
| `deploy-ship SCRUM-123`   | — (script + fix agents) | —                 | —      | Monitors CI; classifies failure type; dispatches the matching `fix-*` agent (max 3 retries per type)                                                                                                                                                                                                                        |
| `release SCRUM-123`       | — (script)              | —                 | —      | Smart CDK targeting (rag-only vs full infra), smoke tests, writes `.last-known-good-commit`                                                                                                                                                                                                                                 |
| `rollback SCRUM-123`      | — (script)              | —                 | —      | Reverts CDK stacks to `.last-known-good-commit` — deterministic git + CDK operation                                                                                                                                                                                                                                         |
| `fix-lint SCRUM-123`      | `fix-lint-agent`        | Claude Haiku 4.5  | $1.0   | ESLint/Prettier fixes are rule-based and mechanical — Haiku is fast and cost-efficient here                                                                                                                                                                                                                                 |
| `fix-types SCRUM-123`     | `fix-types-agent`       | Claude Haiku 4.5  | $1.0   | TypeScript type annotations are mostly mechanical (add types, fix null checks) — Haiku sufficient; includes warm-continue on retry                                                                                                                                                                                          |
| `fix-tests SCRUM-123`     | `fix-tests-agent`       | Claude Sonnet 4.6 | $2.0   | Failing tests often need reasoning about what changed vs what was expected — Sonnet required; includes warm-continue on retry                                                                                                                                                                                               |
| `fix-build SCRUM-123`     | `fix-build-agent`       | Claude Sonnet 4.6 | $2.0   | Build errors can involve complex dependency resolution and config changes — Sonnet required; includes warm-continue on retry                                                                                                                                                                                                |
| `fix-security SCRUM-123`  | `fix-security-agent`    | Claude Sonnet 4.6 | $2.0   | `npm audit fix` may need reasoning about which CVEs to fix vs accept and manual patching                                                                                                                                                                                                                                    |
| `fix-conflicts SCRUM-123` | `fix-conflicts-agent`   | Claude Sonnet 4.6 | $2.0   | Semantic merge conflicts require understanding intent of both branches — Sonnet required                                                                                                                                                                                                                                    |
| `status SCRUM-123`        | — (script)              | —                 | —      | Reads live pipeline state from Jira subtask statuses — no AI needed                                                                                                                                                                                                                                                         |

**Gated steps** (each checks the prior subtask = "Done" before running):
`requirements → design → code-impl → code-test → code-quality → code-security → code-perf → validate → deploy-pr`

**Approval mechanism:** Transition subtask to "Done" in Jira UI — no CLI `approve` command.

**`deploy-ship` CI failure handling:**

1. Fetches `gh pr checks` output
2. Classifies failure: `lint | types | tests | build | security | conflicts | unknown`
3. Dispatches the corresponding `fix-*` subcommand (max 3 retries per type → hard-block)
4. Commits + pushes fix, re-runs `deploy-ship`

**`release` deployment strategy** (smart CDK targeting):

| Changed paths                  | Stacks deployed                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `apps/vyasa-rag-service/` only | `OrderFlow-VyasaRag` (fast path — ~2s Lambda update)                             |
| `infra/` (any)                 | `OrderFlow-VyasaVector` + `OrderFlow-VyasaRag` (+ `VyasaUi` if ui-stack changed) |
| `apps/vyasa-ui/`               | S3 sync + CloudFront invalidation (CF dist ID `E1W56P4E23UU5Y`)                  |
| scripts/docs only              | No deploy                                                                        |

`release` also runs smoke tests on the RAG `/health` endpoint and UI domain; auto-rollbacks on failure.

**Prerequisites:** Node.js 22+, `codemie-claude` CLI (`npm install -g @codemieai/code`) or `claude` CLI, `gh` (GitHub CLI), `aws` (AWS CLI), Jira env vars (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`)

> **Note:** Override `claudeCmd` in a custom `ai-dlc.config.ts` at repo root to use `claude` (raw Claude Code CLI) instead of the default `codemie-claude`.

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
| **11** | `scripts/ai-dev/` (TS CLI)      | 1 dir           | 15 min | Steps 6+8    |

---

## What You Get After Each Phase

| After Phase         | What works                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** (Brain)       | Every Claude session in Windsurf instantly knows the full project context — no re-explaining stack, patterns, or standards                     |
| **B** (Agents)      | `runAgent()` helper invokes `codemie-claude -p <instructions> --model sonnet --permission-mode bypassPermissions` for autonomous PR generation |
| **C** (MCPs)        | Orchestrator can read Jira tickets itself + Langfuse observability for RAG eval — no manual copy-paste                                         |
| **D** (Security CI) | Every PR gets AI security review via Bedrock — no code leaves your AWS VPC                                                                     |
| **E** (Script)      | Async pipeline: `npm run ai-dev -- JIRA-456 <step>` — review offline, approve, trigger next step                                               |

---

## Agentic Pipeline (10-Step Workflow)

> **Status:** Fully implemented in TypeScript CLI (`scripts/ai-dev/`). The original 5-section model has
> evolved into a 10-step pipeline with dedicated code sub-phases (impl → test → quality →
> security → perf), automated CI monitoring, and a post-merge release/rollback lifecycle.

### Overview

Each step is independently triggerable. State lives in Jira subtasks + local marker files.
Human approval = transitioning the subtask to "Done". The `code` subcommand is an alias that
runs all 5 code sub-steps automatically (useful for trusted changes).

### Step 1: Requirements Analysis

| Aspect      | Details                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| **Agent**   | `requirements-agent` ✅                                                                   |
| **Input**   | Jira ticket context (`.ticket-context`)                                                   |
| **Output**  | `docs/features/TICKET/requirements.md` (Given/When/Then ACs + Design Decisions)           |
| **Model**   | Sonnet — $1.50                                                                            |
| **Resolve** | Open questions posted to Jira as `## Design Decisions` blocks; `resolve` pulls PO answers |

🚪 **Human Gate:** Review `requirements.md`, transition subtask to "Done". Run `resolve` if open questions remain (multi-round Q&A loop).

---

### Step 2: Technical Design

| Aspect     | Details                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Agent**  | `design-agent` ✅                                                                                                           |
| **Input**  | Approved `requirements.md`                                                                                                  |
| **Output** | `docs/features/TICKET/TDD.md` — API contract, DB schema, Mermaid sequence diagram, rollback plan, Spec Validation Checklist |
| **Model**  | Sonnet — $2.00                                                                                                              |

🚪 **Human Gate:** Review TDD (API contract, schema, rollback plan, open questions section). Transition to "Done".

---

### Step 3: Implementation

| Aspect       | Details                                                   |
| ------------ | --------------------------------------------------------- |
| **Agent**    | `code-impl-agent` ✅                                      |
| **Input**    | Approved `TDD.md` + `requirements.md`                     |
| **Output**   | Source files + `IMPL_CHECKLIST.md` (all items must be ✅) |
| **Model**    | Sonnet — $3.00                                            |
| **Approach** | Spec-driven TDD: failing test → implementation → refactor |

**Gate:** `IMPL_CHECKLIST.md` must exist with no ❌ before `code-test` can run.

🚪 **Human Gate:** Review implementation + IMPL_CHECKLIST.md, run locally. Transition to "Done".

---

### Step 4: Spec Compliance Testing

| Aspect     | Details                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| **Agent**  | `code-test-agent` ✅                                                         |
| **Input**  | `requirements.md`, `TDD.md`, `IMPL_CHECKLIST.md`, changed files              |
| **Output** | Tests with `// AC: <id>` tags tracing each acceptance criterion              |
| **Model**  | Sonnet — $2.00 (+ $2.00 retry if coverage < 80%)                             |
| **Gate**   | 80% branches/functions/lines/statements (`jest --coverage`) — blocks on fail |

🚪 **Human Gate:** Review coverage report. Transition to "Done".

---

### Step 5: Code Quality

| Aspect       | Details                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| **Agent**    | `code-quality-agent` ✅ (invoked only if auto-fix leaves errors)        |
| **Input**    | Changed files, residual ESLint error list                               |
| **Auto-fix** | `eslint --fix` + `prettier --write` run first; agent handles remainders |
| **Model**    | Sonnet — $0.50                                                          |
| **Gate**     | `eslint` clean + `tsc --noEmit` pass                                    |

🚪 **Human Gate:** Transition to "Done" when quality checks pass.

---

### Step 6: Security Review

| Aspect         | Details                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **Agent**      | `code-security-agent` ✅                                                                         |
| **Pre-flight** | Secrets scan on `git diff` (regex patterns for credentials/keys); `npm audit --audit-level=high` |
| **Output**     | `docs/features/TICKET/SECURITY_REVIEW.md` with `## Overall Verdict`                              |
| **Model**      | Sonnet — $1.00                                                                                   |
| **Gate**       | Verdict must not be `FAIL`; secrets scan must be clean                                           |

🚪 **Human Gate:** Review `SECURITY_REVIEW.md`. Transition to "Done" when verdict is acceptable.

---

### Step 7: Performance Review

| Aspect     | Details                                         |
| ---------- | ----------------------------------------------- |
| **Agent**  | `code-perf-agent` ✅                            |
| **Input**  | `TDD.md`, changed files                         |
| **Output** | N+1 query review, cache hit analysis, E2E stubs |
| **Model**  | Sonnet — $2.00                                  |

🚪 **Human Gate:** Transition to "Done" when performance findings are acceptable.

---

### Step 8: Validate (CI Dry-Run)

| Aspect     | Details                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| **Type**   | Script-only — no agent (Jira subtask created but auto-managed)                  |
| **Checks** | [1] ESLint, [2] `tsc --noEmit`, [3] jest 80% coverage, [4] build, [5] npm audit |
| **Output** | `.validate-passed` marker (gates `deploy-pr`)                                   |
| **Gate**   | Gated by `code-perf` subtask Done (per `PREREQUISITE_MAP`)                      |

No human gate — either passes and unlocks `deploy-pr`, or fails with per-check fix guidance.

---

### Step 9: Deploy PR + Ship

| Subcommand    | Agent                            | Details                                                                           |
| ------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `deploy-pr`   | `deploy-agent` (sonnet — $2.00)  | Push branch, open PR with filled template via `gh` CLI; poll CI for 60s           |
| `deploy-ship` | `fix-*` agents (auto-dispatched) | Monitor CI; classify failure type → dispatch fix agent → commit + push → re-check |

**CI failure classification (`deploy-ship`):**

| CI Failure  | Fix dispatched                       | Max retries         |
| ----------- | ------------------------------------ | ------------------- |
| `lint`      | `fix-lint-agent` (haiku $1.00)       | 3                   |
| `types`     | `fix-types-agent` (haiku $1.00)      | 3 (+ warm-continue) |
| `tests`     | `fix-tests-agent` (sonnet $2.00)     | 3 (+ warm-continue) |
| `build`     | `fix-build-agent` (sonnet $2.00)     | 3 (+ warm-continue) |
| `security`  | `fix-security-agent` (sonnet $2.00)  | 3                   |
| `conflicts` | `fix-conflicts-agent` (sonnet $2.00) | 3                   |
| `unknown`   | — (manual required)                  | —                   |

No auto-merge — Fortune 500 compliance requires human approval: `gh pr merge <N> --squash --delete-branch`

---

### Step 10: Release + Rollback

| Subcommand | Details                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `release`  | Verifies PR merged; `cdk synth` pre-flight; builds; smart CDK deploy; smoke tests; auto-rollback on failure; Jira "Done" |
| `rollback` | Manual escape hatch: reads `.last-known-good-commit`, checks out infra + apps at that commit, re-deploys CDK stacks      |

---

### Token Efficiency

| Technique                                             | Savings                                                  |
| ----------------------------------------------------- | -------------------------------------------------------- |
| Separate requirements → design → impl phases          | ~30% — each agent gets clean, focused input              |
| Auto-fix before quality agent                         | ~80% of quality agent calls eliminated                   |
| Haiku for deploy + fix-lint (scripting only)          | ~60% vs Sonnet per call                                  |
| Script-only `validate` (no LLM)                       | 100% LLM tokens for CI check eliminated                  |
| `deploy-ship` classifies then fixes (not blind retry) | Avoids re-running whole pipeline on simple lint failures |

---

### Design Principles

> Aligned with industry AI-SDLC frameworks (ref: `ai-agentic-sdlc-workflow` architecture).

| Principle                        | Enforcement in this pipeline                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Orchestrator never codes**     | TypeScript CLI dispatches agents; `runAgent()` only passes prompts and reads results                    |
| **Separation of concerns**       | Each agent owns one task; communication through disk artifacts (`docs/features/TICKET/`), not chat      |
| **No fabrication**               | `## No Fabrication Rule` in all 6 code-writing agents — blocks on ungrounded references                 |
| **Bounded retries**              | `deploy-ship` max 3/type; `code-test` 1 retry; escalates to human on exhaust                            |
| **Budget-based cost control**    | `--max-budget-usd` per agent invocation; config in `scripts/ai-dev/config.ts`                           |
| **Zero-reasoning scripts**       | `validate`, `init`, `resolve`, `status` — deterministic operations with no LLM call                     |
| **Fail-fast gate ordering**      | Cheapest checks first: lint → tsc → jest → build → audit (validate step)                                |
| **Spec as source of truth**      | Agents read `requirements.md` + `TDD.md` — never derive intent from chat history                        |
| **Human-gated async flow**       | Jira subtask "Done" transitions gate each step; `checkPrerequisite()` enforces                          |
| **Brownfield context injection** | `gatherBrownfieldContext()` pre-collects patterns; injected as `{BROWNFIELD_CONTEXT}` — zero agent cost |

---

### Workflow Diagram

```mermaid
flowchart TD
    S0["create: ticket-creator-agent\nOutput: Jira ticket"]
    S1["requirements: requirements-agent\nOutput: requirements.md + Design Decisions"]
    R1{{"resolve loop: PO answers → update requirements.md"}}
    G1{{"HUMAN GATE: requirements Done"}}
    S2["design: design-agent\nOutput: TDD.md + Spec Checklist"]
    G2{{"HUMAN GATE: design Done"}}
    S3["code-impl: code-impl-agent\nOutput: source + IMPL_CHECKLIST.md"]
    G3{{"HUMAN GATE: code-impl Done"}}
    S4["code-test: code-test-agent\nOutput: AC-tagged tests, 80% coverage"]
    G4{{"HUMAN GATE: code-test Done"}}
    S5["code-quality: auto-fix + quality-agent\nOutput: ESLint + tsc clean"]
    G5{{"HUMAN GATE: code-quality Done"}}
    S6["code-security: secrets scan + security-agent\nOutput: SECURITY_REVIEW.md"]
    G6{{"HUMAN GATE: code-security Done"}}
    S7["code-perf: perf-agent\nOutput: N+1 review + E2E stubs"]
    G7{{"HUMAN GATE: code-perf Done"}}
    S8["validate: script-only CI dry-run\nESLint / tsc / jest / build / audit"]
    S9a["deploy-pr: deploy-agent\nOutput: PR opened"]
    S9b["deploy-ship: CI monitor + fix-* agents\nLoop until green"]
    G9{{"HUMAN: merge PR\ngh pr merge N --squash"}}
    S10["release: CDK deploy + smoke tests\nAuto-rollback on failure"]

    S0 --> S1 --> R1 --> G1 --> S2 --> G2 --> S3 --> G3
    G3 --> S4 --> G4 --> S5 --> G5 --> S6 --> G6 --> S7 --> G7
    G7 --> S8 --> S9a --> S9b --> G9 --> S10
```

### Implementation Readiness

| Step | Subcommand                  | Agent                    | Status |
| ---- | --------------------------- | ------------------------ | ------ |
| 0    | `create`                    | `ticket-creator`         | ✅     |
| 1    | `requirements` + `resolve`  | `requirements-agent`     | ✅     |
| 2    | `design`                    | `design-agent`           | ✅     |
| 3    | `code-impl`                 | `code-impl-agent`        | ✅     |
| 4    | `code-test`                 | `code-test-agent`        | ✅     |
| 5    | `code-quality`              | `code-quality-agent`     | ✅     |
| 6    | `code-security`             | `code-security-agent`    | ✅     |
| 7    | `code-perf`                 | `code-perf-agent`        | ✅     |
| 8    | `validate`                  | script-only              | ✅     |
| 9    | `deploy-pr` + `deploy-ship` | `deploy-agent` + `fix-*` | ✅     |
| 10   | `release` + `rollback`      | script-only + CDK        | ✅     |

---

## Status Tracking

### Phase A — Project Brain

- [x] A.1 — `.claudeignore`
- [x] A.2 — Root `CLAUDE.md`
- [x] A.3 — Per-service `CLAUDE.md` files
  - [x] `apps/vyasa-rag-service/CLAUDE.md`
  - [x] `infra/CLAUDE.md`
  - [x] `apps/vyasa-ui/CLAUDE.md`
  - [ ] `apps/vyasa-slack-cmd/CLAUDE.md` — pending (app exists, no CLAUDE.md yet)
  - [ ] `apps/order-service/CLAUDE.md` — deferred (service not scaffolded)
  - [ ] `apps/notification-svc/CLAUDE.md` — deferred (service not scaffolded)
  - [ ] `apps/web/CLAUDE.md` — deferred (service not scaffolded)
- [x] A.4 — Global `~/.claude/CLAUDE.md` (updated existing file)

### Phase B — Agent Infrastructure

- [x] B.1 — `.cloud/permissions.yaml`
- [x] B.2 — `agents/orchestrator/instructions.md` (legacy — superseded by TypeScript CLI dispatcher)
- [x] B.3 — Sub-agent instruction files
  - [x] `agents/requirements-agent/instructions.md`
  - [x] `agents/design-agent/instructions.md`
  - [x] `agents/code-impl-agent/instructions.md`
  - [x] `agents/code-test-agent/instructions.md`
  - [x] `agents/code-quality-agent/instructions.md`
  - [x] `agents/code-security-agent/instructions.md`
  - [x] `agents/code-perf-agent/instructions.md`
  - [x] `agents/deploy-agent/instructions.md`
  - [x] `agents/ticket-creator/instructions.md`
  - [x] `agents/fix-lint-agent/instructions.md`
  - [x] `agents/fix-types-agent/instructions.md`
  - [x] `agents/fix-tests-agent/instructions.md`
  - [x] `agents/fix-build-agent/instructions.md`
  - [x] `agents/fix-security-agent/instructions.md`
  - [x] `agents/fix-conflicts-agent/instructions.md`
- [x] B.4 — `hooks/pre-tool.sh` + `hooks/post-tool.sh`
- [x] B.5 — Skills library
  - [x] `skills/create-test-file/skill.md`
  - [x] `skills/update-changelog/skill.md`
  - [x] `skills/open-pr/skill.md`
  - [ ] `skills/generate-prisma-migration/skill.md` — deferred (Prisma not in active use)

### Phase C — MCP Configuration

- [x] C.1 — `.mcp.json` with GitHub, AWS Unified, Jira, Langfuse MCPs

### Phase D — LLM Security in CI/CD

- [x] D.1 — AWS Bedrock model access enabled (Claude Sonnet 4.5 + Nova Pro)
- [x] D.2 — IAM role created: `orderflow-github-bedrock-role` (arn:aws:iam::947612421212:role/orderflow-github-bedrock-role)
- [x] D.2b — `AWS_BEDROCK_ROLE_ARN` secret added to GitHub repo
- [ ] D.3 — VPC endpoint for Bedrock ⚠️ OPTIONAL — recommended for production
- [x] D.4 — `.github/workflows/llm-security-scan.yml.disabled` (created but disabled)

### Phase E — Operator Script (10-Step Pipeline)

- [x] E.1 — `scripts/ai-dev/` — TypeScript CLI (Jira-backed subcommand dispatcher)
  - [x] 25 subcommands: `help, create, init, requirements, resolve, design, code, code-impl, code-test, code-quality, code-security, code-perf, validate, deploy-pr, deploy-ship, deploy (deprecated), release, rollback, fix-lint, fix-types, fix-tests, fix-build, fix-security, fix-conflicts, status`
  - [x] `runAgent()` helper — native `{VAR}` substitution via `String.replaceAll()`, `--permission-mode bypassPermissions`
  - [x] **Structured agent return format** — `AgentResult` type with `status` (done|fail|blocked|setup-error), `summary`, `followups`; parsed from stdout between `---AGENT_RESULT_START---` / `---AGENT_RESULT_END---` markers; enables deterministic orchestration decisions (retry, re-plan, hard-block)
  - [x] 10 Jira subtasks created per ticket (all STEPS_ORDERED: requirements → deploy-ship)
  - [x] 8 gated steps (each validates prior subtask = "Done" in Jira) + validate gated by code-perf
  - [x] Jira REST API helpers (create, comment, attachment, transition, get status)
  - [x] `resolve` — multi-round PO Q&A loop via Jira comments
  - [x] `validate` — script-only CI dry-run (5 checks, no LLM, no Jira subtask)
  - [x] `deploy-ship` — CI classification + auto-dispatch to `fix-*` agents (max 3 retries/type)
  - [x] `release` — smart CDK deploy + smoke tests + auto-rollback on failure
  - [x] `rollback` — manual CDK revert to `.last-known-good-commit`
  - [x] Local state files: `subtasks.json`, `.branch`, `.ticket-summary`, `.pr_number`, `.fix_retries.json`, `.last-known-good-commit`, `.validate-passed`, `.questions-round`
  - [x] Budget-based cost control (`--max-budget-usd`) per agent
  - [x] `claudeCmd` config (default: `codemie-claude`; override via `ai-dlc.config.ts` for raw `claude` CLI)
- [x] E.2 — `agents/ticket-creator/instructions.md` — structured JSON output from one-liner idea

### Agentic Pipeline (all steps implemented)

- [x] Step 1: `requirements` — requirements-agent + `resolve` Q&A loop
- [x] Step 2: `design` — design-agent, Spec Validation Checklist in TDD.md
- [x] Step 3: `code-impl` — code-impl-agent, IMPL_CHECKLIST.md gate
- [x] Step 4: `code-test` — code-test-agent, 80% coverage gate with 1 auto-retry
- [x] Step 5: `code-quality` — auto-fix first, quality-agent for remainders
- [x] Step 6: `code-security` — secrets scan pre-flight + security-agent + SECURITY_REVIEW.md gate
- [x] Step 7: `code-perf` — perf-agent, N+1 review + E2E stubs
- [x] Step 8: `validate` — script-only 5-check CI dry-run, `.validate-passed` marker
- [x] Step 9: `deploy-pr` + `deploy-ship` — PR creation + CI monitoring + auto-fix dispatch
- [x] Step 10: `release` + `rollback` — CDK deploy, smoke tests, auto-rollback, Jira Done
