# Orchestrator Agent — Vyasa Intelligence

## IMPORTANT: Follow these steps in exact order. Do not skip steps. Do not combine steps.

## Inputs

- `{TICKET_ID}` — e.g. `JIRA-456`
- `{TICKET_CONTEXT}` — full ticket JSON or description with acceptance criteria

---

## Pre-flight Checks (run before any step)

1. Read `.cloud/permissions.yaml` — confirm no blocked operations are needed
2. Confirm you are NOT on the `main` branch
3. Check `git status` — working directory must be clean before starting

---

## Step 1 — Parse Ticket

Extract from `{TICKET_CONTEXT}`:

- Title
- Description
- Acceptance criteria (list each as a testable statement)
- Affected service(s): `vyasa-rag-service` | `vyasa-ui` | `infra` | `libs/shared-types`
- Ticket type: `feature` | `bug` | `chore`

If acceptance criteria are missing or ambiguous, STOP and report:

```
ORCHESTRATOR: Cannot proceed — acceptance criteria missing from ticket {TICKET_ID}.
Please clarify: [list what is unclear]
```

---

## Step 2 — Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/{TICKET_ID}-$(echo "{TICKET_CONTEXT}" | head -c 40 | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-')
```

Confirm branch was created. If branch already exists, STOP and report.

---

## Step 3 — Call Requirements Agent

```bash
claude -p agents/requirements-agent/instructions.md \
  --var TICKET_ID="{TICKET_ID}" \
  --var TICKET_CONTEXT="{TICKET_CONTEXT}" \
  --max-turns 10
```

**Wait for completion.**

Verify output exists: `docs/features/{TICKET_ID}/requirements.md`
If missing: retry once. If still missing: STOP and report failure.

**🚪 HUMAN GATE (optional):** If running interactively, pause here and ask:

```
ORCHESTRATOR: Requirements ready at docs/features/{TICKET_ID}/requirements.md
Review and confirm to proceed, or provide feedback.
```

---

## Step 4 — Call Design Agent

```bash
claude -p agents/design-agent/instructions.md \
  --var TICKET_ID="{TICKET_ID}" \
  --var TICKET_CONTEXT="{TICKET_CONTEXT}" \
  --var REQUIREMENTS_PATH="docs/features/{TICKET_ID}/requirements.md" \
  --max-turns 15
```

**Wait for completion.**

Verify output exists: `docs/features/{TICKET_ID}/TDD.md`
If missing: retry once. If still missing: STOP and report failure.

Verify `TDD.md` contains the Spec Validation Checklist section at the bottom.
If missing: call design-agent again with instruction to append the checklist.

---

## Step 5 — Call Code Agent

```bash
claude -p agents/code-agent/instructions.md \
  --var TICKET_ID="{TICKET_ID}" \
  --var TDD_PATH="docs/features/{TICKET_ID}/TDD.md" \
  --max-turns 30
```

**Wait for completion.**

Run verification:

```bash
npm run lint -- --quiet
npm run test:affected
```

If lint fails: call code-agent again with lint output as context. Max 2 retries.
If tests fail: call code-agent again with test failure output as context. Max 2 retries.
If still failing after retries: STOP and report — do NOT open PR with failing tests.

---

## Step 6 — Call Test Agent

```bash
claude -p agents/test-agent/instructions.md \
  --var TICKET_ID="{TICKET_ID}" \
  --var CHANGED_FILES="$(git diff main --name-only)" \
  --max-turns 20
```

**Wait for completion.**

Run coverage check:

```bash
npm run test:affected -- --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}'
```

If coverage below 80%: call test-agent again. Max 1 retry.

---

## Step 7 — Update Changelog

Read `skills/update-changelog/skill.md` and apply it.
Add entry under `## [Unreleased]` in `CHANGELOG.md`.

---

## Step 8 — Call Deploy Agent

```bash
claude -p agents/deploy-agent/instructions.md \
  --var TICKET_ID="{TICKET_ID}" \
  --var BRANCH="$(git branch --show-current)" \
  --var CHANGED_FILES="$(git diff main --name-only | tr '\n' ',')" \
  --max-turns 10
```

**Wait for completion.**

Verify PR was opened (deploy-agent will output the PR URL).

---

## Step 9 — Report Summary

Output a summary in this format:

```
ORCHESTRATOR COMPLETE ✓

Ticket:     {TICKET_ID}
Branch:     feature/{TICKET_ID}-...
PR:         [URL from deploy-agent]
Tests:      PASS (coverage: X%)
Changed:    [list of files]
Duration:   [elapsed time]

Next steps for human reviewer:
- [ ] Review requirements.md at docs/features/{TICKET_ID}/requirements.md
- [ ] Review TDD.md at docs/features/{TICKET_ID}/TDD.md
- [ ] Verify Spec Validation Checklist in TDD.md is fully checked
- [ ] Review PR diff
- [ ] Approve and merge when ready
```
