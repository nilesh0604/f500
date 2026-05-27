# Orchestrator — Vyasa Intelligence (Jira-Backed Async Pipeline)

## Overview

The AI-driven development pipeline operates as **independent, manually-triggered steps** with
state tracked entirely in Jira. Each step creates output, posts it to a Jira subtask,
and the human reviews offline. Approval = transitioning the subtask to "Done" in Jira.

```
Human triggers step → Agent produces output → Posted to Jira subtask → Human reviews in Jira → Transitions to Done → Next step unlocked
```

---

## Architecture

```
Parent ticket: OF-123 "Add session timeout"
├── Subtask: OF-124 "[AI] Requirements"     → requirements.md (summary + attachment)
├── Subtask: OF-125 "[AI] Design"           → TDD.md (summary + attachment)
├── Subtask: OF-126 "[AI] Implementation"   → changed files list, lint/test status
├── Subtask: OF-127 "[AI] Testing"          → coverage report (auto-completes)
└── Subtask: OF-128 "[AI] Deploy"           → PR URL (auto-completes)
```

---

## Pipeline Steps

| #   | Step           | Agent              | Input             | Output (in Jira)                             | Human Gate              |
| --- | -------------- | ------------------ | ----------------- | -------------------------------------------- | ----------------------- |
| —   | `create`       | ticket-creator     | One-liner idea    | New Jira ticket with structured description  | **Yes** (review ticket) |
| 0   | `init`         | (shell only)       | Ticket ID         | Subtasks created + branch                    | —                       |
| 1   | `requirements` | requirements-agent | Ticket context    | Summary comment + `requirements.md` attached | **Yes**                 |
| 2   | `design`       | design-agent       | `requirements.md` | Summary comment + `TDD.md` attached          | **Yes**                 |
| 3   | `code`         | code-agent         | `TDD.md`          | Changed files + lint/test status comment     | **Yes**                 |
| 4   | `test`         | test-agent         | Changed files     | Coverage report comment                      | No (auto-Done)          |
| 5   | `deploy`       | deploy-agent       | Branch + files    | PR URL comment                               | No (auto-Done)          |

---

## Usage

```bash
# 0. Create a ticket from an idea (optional — skip if ticket already exists)
./scripts/ai-dev.sh OF create "add session timeout to chat"
# → Review in Jira: edit title, description, priority if needed

# 1. Initialize — creates subtasks + branch
./scripts/ai-dev.sh OF-123 init

# 2. Requirements analysis
./scripts/ai-dev.sh OF-123 requirements
# → Review in Jira: transition "[AI] Requirements" subtask to Done

# 3. Technical design
./scripts/ai-dev.sh OF-123 design
# → Review in Jira: transition "[AI] Design" subtask to Done

# 4. Implementation
./scripts/ai-dev.sh OF-123 code
# → Review branch + Jira comment: transition "[AI] Implementation" to Done

# 5. Test coverage
./scripts/ai-dev.sh OF-123 test
# (auto-completes — no approval needed)

# 6. Open PR
./scripts/ai-dev.sh OF-123 deploy
# (auto-completes — review the PR on GitHub)

# Check progress anytime
./scripts/ai-dev.sh OF-123 status
```

---

## Human Approval Flow

1. Agent runs and posts output to the Jira subtask (comment + file attachment)
2. Human receives notification in Jira (or checks via `status` command)
3. Human reviews the artifact offline — no time pressure
4. If satisfied: transition subtask to **"Done"** in Jira UI
5. If feedback needed: add a comment on the subtask, then re-run the step
6. Script checks subtask status before allowing next step to proceed

---

## Prerequisite Validation

Each step queries Jira for the prior subtask's status:

| Step         | Jira check                           |
| ------------ | ------------------------------------ |
| requirements | Subtasks exist (init was run)        |
| design       | Requirements subtask status = "Done" |
| code         | Design subtask status = "Done"       |
| test         | Code subtask status = "Done"         |
| deploy       | Test subtask status = "Done"         |

If prerequisite fails, the script prints which subtask to review and exits.

---

## What Gets Posted to Jira (not code)

| Step         | Comment summary                                     | Attachment        |
| ------------ | --------------------------------------------------- | ----------------- |
| requirements | AC count, edge cases, affected services, highlights | `requirements.md` |
| design       | API contracts, schema changes, security notes       | `TDD.md`          |
| code         | Changed files list, lint/test pass status           | —                 |
| test         | Coverage report, pass/fail                          | —                 |
| deploy       | PR URL, branch name                                 | —                 |

**Code stays in git only.** Jira gets summaries and design documents, not source files.

---

## Local Files

Two local files are created during `init`:

```
docs/features/{TICKET_ID}/.jira-subtasks    — subtask key mappings (e.g., requirements=OF-124)
docs/features/{TICKET_ID}/.ticket-context   — ticket title + description for agent input
```

These are lookup caches — all actual state lives in Jira.

---

## Agent Contracts

| Agent          | File                                        | Model         |
| -------------- | ------------------------------------------- | ------------- |
| Ticket Creator | `agents/ticket-creator/instructions.md`     | Claude Sonnet |
| Requirements   | `agents/requirements-agent/instructions.md` | Claude Sonnet |
| Design         | `agents/design-agent/instructions.md`       | Claude Sonnet |
| Code           | `agents/code-agent/instructions.md`         | Claude Sonnet |
| Test           | `agents/test-agent/instructions.md`         | Claude Sonnet |
| Deploy         | `agents/deploy-agent/instructions.md`       | Claude Haiku  |

---

## Prerequisites

- `claude` CLI (`npm install -g @anthropic-ai/claude-code`)
- `jq` (`brew install jq`)
- `curl`
- Environment variables: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- Jira project must support subtask creation
- Standard workflow: "To Do" → "In Progress" → "Done"
