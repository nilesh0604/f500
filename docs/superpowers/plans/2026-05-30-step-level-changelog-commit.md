# Step-Level Changelog & Commit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At the end of every pipeline step, commit staged changes and post a structured changelog comment to the parent Jira ticket.

**Architecture:** Hybrid — for agent-driven steps the agent writes a `.step-report.json` artifact; the shell reads it, runs `git commit`, and posts ADF to the parent ticket. For shell-driven steps (code-test, code-quality, validate, deploy-ship) the shell generates the JSON directly. Four new bash functions handle the mechanics; each `cmd_*` function calls them after `run_agent` and before its existing gate logic.

**Tech Stack:** Bash, `jq`, Jira REST API v3 (ADF), git

---

## File Map

| File                                         | Action | Purpose                                                    |
| -------------------------------------------- | ------ | ---------------------------------------------------------- |
| `scripts/ai-dev.sh`                          | Modify | Add 4 helper functions; wire into all 10 `cmd_*` functions |
| `agents/requirements-agent/instructions.md`  | Modify | Add step-report write instructions                         |
| `agents/design-agent/instructions.md`        | Modify | Add step-report write instructions                         |
| `agents/code-impl-agent/instructions.md`     | Modify | Add step-report write instructions                         |
| `agents/code-security-agent/instructions.md` | Modify | Add step-report write instructions                         |
| `agents/code-perf-agent/instructions.md`     | Modify | Add step-report write instructions                         |
| `agents/deploy-agent/instructions.md`        | Modify | Add step-report write instructions                         |

**Shell-driven steps (no agent instruction changes):** code-test, code-quality, validate, deploy-ship.

---

## Step-Report Ownership

| Step          | Who writes `.step-report.json`  |
| ------------- | ------------------------------- |
| requirements  | agent                           |
| design        | agent                           |
| code-impl     | agent                           |
| code-test     | shell (shell has coverage data) |
| code-quality  | shell (agent may not run)       |
| code-security | agent                           |
| code-perf     | agent                           |
| validate      | shell (no agent)                |
| deploy-pr     | agent                           |
| deploy-ship   | shell (no agent)                |

---

## Task 1: Add four helper functions to `scripts/ai-dev.sh`

**Files:**

- Modify: `scripts/ai-dev.sh` (insert after line 151, before the `# Jira REST API Helpers` section)

- [ ] **Step 1: Open `scripts/ai-dev.sh` and locate insertion point**

Run:

```bash
grep -n "Jira REST API Helpers" scripts/ai-dev.sh
```

Expected: line ~155. The new section goes immediately before that line.

- [ ] **Step 2: Insert the four helper functions**

Add this block immediately before the `# ══════...Jira REST API Helpers` section header in `scripts/ai-dev.sh`:

```bash
# ══════════════════════════════════════════════════════════════════════
# Step-Report Helpers
# ══════════════════════════════════════════════════════════════════════

# validate_step_report
# Verifies .step-report.json exists and has all required fields.
# Aborts (return 1) if missing or malformed — caller should exit.
validate_step_report() {
  local report
  report="$(feature_dir)/.step-report.json"
  if [ ! -f "$report" ]; then
    echo "Error: .step-report.json not found — agent did not write step report." >&2
    return 1
  fi
  if ! jq -e '.step and .status and .summary and .commit_message' "$report" > /dev/null 2>&1; then
    echo "Error: .step-report.json missing required fields (step, status, summary, commit_message)." >&2
    return 1
  fi
  local msg
  msg=$(jq -r '.commit_message' "$report")
  if ! echo "$msg" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|chore|ci|security)(\([a-z0-9-]+\))?: .+'; then
    echo "Error: commit_message does not match Conventional Commits format: $msg" >&2
    return 1
  fi
}

# commit_step_changes
# Stages all changes and commits using commit_message from .step-report.json.
# Silently skips if nothing is staged.
commit_step_changes() {
  local report
  report="$(feature_dir)/.step-report.json"
  local msg
  msg=$(jq -r '.commit_message' "$report")

  git -C "$REPO_ROOT" add -A
  if git -C "$REPO_ROOT" diff --cached --quiet; then
    echo "  [step-report] Nothing staged — skipping commit."
    return 0
  fi
  git -C "$REPO_ROOT" commit -m "$msg"
  echo "  [step-report] Committed: $msg"
}

# post_parent_changelog
# Reads .step-report.json and posts a structured comment to the parent Jira ticket.
# Non-fatal: a Jira failure logs a warning but does not abort the step.
post_parent_changelog() {
  local report
  report="$(feature_dir)/.step-report.json"

  local step status summary commit_message
  step=$(jq -r '.step' "$report")
  status=$(jq -r '.status' "$report")
  summary=$(jq -r '.summary' "$report")
  commit_message=$(jq -r '.commit_message' "$report")

  local status_icon
  [ "$status" = "success" ] && status_icon="✅" || status_icon="❌"
  local status_upper
  status_upper=$(echo "$status" | tr '[:lower:]' '[:upper:]')

  local file_count
  file_count=$(jq '.files_changed | length' "$report")

  local files_text
  if [ "$file_count" -eq 0 ]; then
    files_text="  (No files modified)"
  else
    local visible overflow
    visible=$(jq -r '.files_changed[0:9][] | "  • \(.)"' "$report")
    overflow=$(jq -r 'if (.files_changed | length) > 9 then "  • ...and \((.files_changed | length) - 9) more" else "" end' "$report")
    files_text="$visible"
    [ -n "$overflow" ] && files_text="${files_text}
${overflow}"
  fi

  local validation_text
  validation_text=$(jq -r '
    .validation // {} |
    to_entries |
    map("  \(.key): \(.value)") |
    if length > 0 then join("\n") else "  N/A" end
  ' "$report")

  local short_sha timestamp
  short_sha=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  timestamp=$(date -u '+%Y-%m-%d %H:%M UTC')

  local comment_body
  comment_body="🔖 Step Checkpoint: ${step} [${status_icon} ${status_upper}]

Summary:
  ${summary}

Files Changed (${file_count}):
${files_text}

Validation:
${validation_text}

Commit: ${commit_message} [${short_sha}] • ${timestamp}"

  jira_add_comment "$TICKET_ID" "$comment_body" 2>/dev/null \
    || echo "Warning: Failed to post step changelog to parent ticket $TICKET_ID" >&2
}

# write_shell_step_report <step> <status> <summary> <commit_message> [key=value ...]
# Generates .step-report.json for steps where the shell (not an agent) owns the report.
# Optional key=value pairs populate the validation object.
# files_changed is populated from `git diff main --name-only`.
write_shell_step_report() {
  local step="$1" status="$2" summary="$3" commit_message="$4"
  shift 4

  local validation_json="{}"
  for kv in "$@"; do
    local k="${kv%%=*}" v="${kv#*=}"
    validation_json=$(echo "$validation_json" | jq --arg k "$k" --arg v "$v" '. + {($k): $v}')
  done

  local files_json
  files_json=$(git -C "$REPO_ROOT" diff main --name-only 2>/dev/null \
    | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]")

  local report
  report="$(feature_dir)/.step-report.json"
  jq -n \
    --arg step "$step" \
    --arg status "$status" \
    --arg summary "$summary" \
    --arg commit_message "$commit_message" \
    --argjson files "$files_json" \
    --argjson validation "$validation_json" \
    '{
      step: $step,
      status: $status,
      summary: $summary,
      files_changed: $files,
      validation: $validation,
      commit_message: $commit_message
    }' > "$report"
}
```

- [ ] **Step 3: Verify the functions parse without error**

Run:

```bash
bash -n scripts/ai-dev.sh
```

Expected: no output (clean parse).

- [ ] **Step 4: Smoke-test validate_step_report with a valid JSON**

Run:

```bash
mkdir -p /tmp/ai-dev-test/docs/features/TEST-1
cat > /tmp/ai-dev-test/docs/features/TEST-1/.step-report.json <<'EOF'
{
  "step": "requirements",
  "status": "success",
  "summary": "Wrote requirements.md with 5 ACs",
  "files_changed": ["docs/features/TEST-1/requirements.md"],
  "validation": {},
  "commit_message": "docs(TEST-1): requirements checkpoint"
}
EOF

# Source only the utility functions to test in isolation
(
  REPO_ROOT=/tmp/ai-dev-test
  TICKET_ID=TEST-1
  source <(sed -n '/^feature_dir/,/^# ══.*Jira REST/p' scripts/ai-dev.sh | head -n -2)
  validate_step_report && echo "PASS" || echo "FAIL"
)
```

Expected output: `PASS`

- [ ] **Step 5: Smoke-test validate_step_report with a bad commit_message**

Run:

```bash
(
  REPO_ROOT=/tmp/ai-dev-test
  TICKET_ID=TEST-1
  source <(sed -n '/^feature_dir/,/^# ══.*Jira REST/p' scripts/ai-dev.sh | head -n -2)
  jq '.commit_message = "bad message"' /tmp/ai-dev-test/docs/features/TEST-1/.step-report.json \
    > /tmp/bad-report.json && cp /tmp/bad-report.json /tmp/ai-dev-test/docs/features/TEST-1/.step-report.json
  validate_step_report 2>&1 | grep -q "Conventional Commits" && echo "PASS" || echo "FAIL"
)
```

Expected output: `PASS`

- [ ] **Step 6: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): add validate_step_report, commit_step_changes, post_parent_changelog, write_shell_step_report helpers"
```

---

## Task 2: Wire into `cmd_requirements` and `cmd_design`

**Files:**

- Modify: `scripts/ai-dev.sh:879-975` (`cmd_requirements`)
- Modify: `scripts/ai-dev.sh:1157-1220` (`cmd_design`)

- [ ] **Step 1: Wire into `cmd_requirements`**

In `cmd_requirements`, after the `run_agent` call (currently around line 899–901) and before the `# Verify output` block, add:

```bash
  # Step-report: validate, commit, changelog
  validate_step_report || exit 1
  commit_step_changes
  post_parent_changelog
```

The full surrounding context (for precise placement):

```bash
  run_agent agents/requirements-agent/instructions.md 1.50 sonnet \
    TICKET_ID="$TICKET_ID" \
    TICKET_CONTEXT="$context"

  # Step-report: validate, commit, changelog        ← ADD THESE 3 LINES
  validate_step_report || exit 1                    ← ADD
  commit_step_changes                               ← ADD
  post_parent_changelog                             ← ADD

  # Verify output
  local req_file="$(feature_dir)/requirements.md"
```

- [ ] **Step 2: Wire into `cmd_design`**

In `cmd_design`, after the `run_agent` call (around line 1178–1181) and before `# Verify output`:

```bash
  run_agent agents/design-agent/instructions.md 2.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TICKET_CONTEXT="$context" \
    REQUIREMENTS_PATH="$req_path"

  # Step-report: validate, commit, changelog        ← ADD THESE 3 LINES
  validate_step_report || exit 1                    ← ADD
  commit_step_changes                               ← ADD
  post_parent_changelog                             ← ADD

  # Verify output
  local tdd_file="$(feature_dir)/TDD.md"
```

- [ ] **Step 3: Verify bash parse is still clean**

```bash
bash -n scripts/ai-dev.sh
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire step-report into cmd_requirements and cmd_design"
```

---

## Task 3: Wire into `cmd_code_impl`

**Files:**

- Modify: `scripts/ai-dev.sh:1226-1297` (`cmd_code_impl`)

- [ ] **Step 1: Wire into `cmd_code_impl`**

In `cmd_code_impl`, after the `run_agent` call (around line 1244–1247) and before `# Gate: IMPL_CHECKLIST.md must exist`:

```bash
  run_agent agents/code-impl-agent/instructions.md 3.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TDD_PATH="$tdd_path" \
    REQUIREMENTS_PATH="$req_path"

  # Step-report: validate, commit, changelog        ← ADD
  validate_step_report || exit 1                    ← ADD
  commit_step_changes                               ← ADD
  post_parent_changelog                             ← ADD

  # Gate: IMPL_CHECKLIST.md must exist with no ❌ items
  local checklist_file="$(feature_dir)/IMPL_CHECKLIST.md"
```

- [ ] **Step 2: Verify parse**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire step-report into cmd_code_impl"
```

---

## Task 4: Wire into `cmd_code_test` (shell-written report)

**Files:**

- Modify: `scripts/ai-dev.sh:1303-1392` (`cmd_code_test`)

`cmd_code_test` runs the agent first, then runs `npm run test:affected` (with possible retry). The shell owns the step-report here because it has the final coverage data. The agent does NOT write `.step-report.json`.

- [ ] **Step 1: Wire into `cmd_code_test`**

After the second coverage check block (the block ending around line 1353 with `coverage_pass=false`), and before the `local coverage_summary` line, locate the section:

```bash
    coverage_pass=true
    coverage_output=$(npm run test:affected -- --coverage \
      --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}' \
      --coverageReporters=text 2>&1) || coverage_pass=false
  fi

  local coverage_summary
  coverage_summary=$(echo "$coverage_output" | grep -E "^All files" | head -1 || echo "Coverage data unavailable")
```

After `coverage_summary` is set, add:

```bash
  # Step-report: shell writes, then commit + changelog
  local test_status test_summary_text test_scope
  test_scope=$(git -C "$REPO_ROOT" diff main --name-only 2>/dev/null \
    | grep 'apps/' | head -1 | awk -F'/' '{print $2}' || true)
  [ -z "$test_scope" ] && test_scope="$TICKET_ID"

  if [ "$coverage_pass" = true ]; then
    test_status="success"
    test_summary_text="Coverage at/above 80% threshold. ${coverage_summary}"
  else
    test_status="failure"
    test_summary_text="Coverage below 80% after retry. ${coverage_summary}"
  fi
  write_shell_step_report "code-test" "$test_status" "$test_summary_text" \
    "test(${test_scope}): spec compliance tests [${TICKET_ID}]" \
    "coverage=${coverage_summary}"
  commit_step_changes
  post_parent_changelog
```

Note: no `validate_step_report` call here because `write_shell_step_report` always writes valid JSON.

- [ ] **Step 2: Verify parse**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire shell-written step-report into cmd_code_test"
```

---

## Task 5: Wire into `cmd_code_quality` (shell-written report)

**Files:**

- Modify: `scripts/ai-dev.sh:1398-1476` (`cmd_code_quality`)

The agent may or may not run (only if auto-fix leaves errors). The shell owns the report using gate check results.

- [ ] **Step 1: Locate the gate check block**

The existing gate block (around line 1440–1462) looks like:

```bash
  # Final gates: eslint, tsc, prettier
  local lint_pass=true tsc_pass=true
  npm run lint -- --quiet 2>/dev/null || lint_pass=false
  npx tsc --noEmit 2>/dev/null || tsc_pass=false

  local comment_body
  comment_body="AI Pipeline — Code Quality Complete
  ...

  jira_add_comment "$subtask_key" "$comment_body"

  if [ "$lint_pass" != true ] || [ "$tsc_pass" != true ]; then
    echo ""
    echo "Error: Quality checks still failing."
    echo "Fix manually, then re-run: ./scripts/ai-dev.sh $TICKET_ID code-quality"
    exit 1
  fi
```

- [ ] **Step 2: Wire in the shell-written step-report**

After the `tsc_pass` gate check lines (after `npx tsc --noEmit 2>/dev/null || tsc_pass=false`) and before the `local comment_body` line, add:

```bash
  # Step-report: shell writes based on gate results
  local qual_status qual_summary qual_scope
  qual_scope=$(git -C "$REPO_ROOT" diff main --name-only 2>/dev/null \
    | grep 'apps/' | head -1 | awk -F'/' '{print $2}' || true)
  [ -z "$qual_scope" ] && qual_scope="$TICKET_ID"

  if [ "$lint_pass" = true ] && [ "$tsc_pass" = true ]; then
    qual_status="success"
    qual_summary="ESLint and TypeScript checks passed (${errors_before} lint errors resolved)"
  else
    qual_status="failure"
    qual_summary="Quality checks failed — lint: ${lint_pass}, tsc: ${tsc_pass}"
  fi
  write_shell_step_report "code-quality" "$qual_status" "$qual_summary" \
    "refactor(${qual_scope}): quality pass [${TICKET_ID}]" \
    "lint_errors=$([ "$lint_pass" = true ] && echo "0" || echo "remaining")" \
    "type_errors=$([ "$tsc_pass" = true ] && echo "0" || echo "remaining")"
  commit_step_changes
  post_parent_changelog
```

- [ ] **Step 3: Verify parse**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire shell-written step-report into cmd_code_quality"
```

---

## Task 6: Wire into `cmd_code_security` and `cmd_code_perf`

**Files:**

- Modify: `scripts/ai-dev.sh:1487-1579` (`cmd_code_security`)
- Modify: `scripts/ai-dev.sh:1585-1634` (`cmd_code_perf`)

- [ ] **Step 1: Wire into `cmd_code_security`**

After the `run_agent` call (around line 1525–1529) and before `# Gate: SECURITY_REVIEW.md must exist`:

```bash
  run_agent agents/code-security-agent/instructions.md 1.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TDD_PATH="$tdd_path" \
    CHANGED_FILES="$changed_files" \
    AUDIT_OUTPUT="$audit_summary"

  # Step-report: validate, commit, changelog        ← ADD
  validate_step_report || exit 1                    ← ADD
  commit_step_changes                               ← ADD
  post_parent_changelog                             ← ADD

  # Gate: SECURITY_REVIEW.md must exist with verdict != FAIL
  local security_review="$(feature_dir)/SECURITY_REVIEW.md"
```

- [ ] **Step 2: Wire into `cmd_code_perf`**

In `cmd_code_perf`, after the `run_agent` call (around line 1605–1608) and before `local comment_body`:

```bash
  run_agent agents/code-perf-agent/instructions.md 2.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TDD_PATH="$tdd_path" \
    CHANGED_FILES="$changed_files"

  # Step-report: validate, commit, changelog        ← ADD
  validate_step_report || exit 1                    ← ADD
  commit_step_changes                               ← ADD
  post_parent_changelog                             ← ADD

  local comment_body
```

- [ ] **Step 3: Verify parse**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire step-report into cmd_code_security and cmd_code_perf"
```

---

## Task 7: Wire into `cmd_deploy_pr`

**Files:**

- Modify: `scripts/ai-dev.sh:1761-1847` (`cmd_deploy_pr`)

`cmd_deploy_pr` already has agent-driven commit logic (the agent commits and opens the PR). The step-report checkpoint commit uses `git diff --cached --quiet` to skip if nothing new is staged.

- [ ] **Step 1: Wire into `cmd_deploy_pr`**

After the `run_agent` call (around line 1794–1797) and before `# Gate: PR must now exist`:

```bash
  run_agent agents/deploy-agent/instructions.md 0.50 haiku \
    TICKET_ID="$TICKET_ID" \
    BRANCH="$branch" \
    CHANGED_FILES="$changed_files"

  # Step-report: validate, commit (may be no-op), changelog    ← ADD
  validate_step_report || exit 1                               ← ADD
  commit_step_changes                                          ← ADD
  post_parent_changelog                                        ← ADD

  # Gate: PR must now exist
  local pr_number pr_url
```

- [ ] **Step 2: Verify parse**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire step-report into cmd_deploy_pr"
```

---

## Task 8: Wire into `cmd_validate` and `cmd_deploy_ship` (shell-written reports)

**Files:**

- Modify: `scripts/ai-dev.sh:1640-1682` (`cmd_validate`)
- Modify: `scripts/ai-dev.sh:1853-end of function` (`cmd_deploy_ship`)

- [ ] **Step 1: Wire into `cmd_validate`**

`cmd_validate` runs 5 checks and exits 1 on failure (around line 1668–1674):

```bash
  if [ "$failed" -eq 1 ]; then
    echo ""
    echo "Validation FAILED for $TICKET_ID."
    echo "Run the appropriate step above to fix, then re-run validate."
    rm -f "$(feature_dir)/.validate-passed"
    exit 1
  fi
```

Before the `if [ "$failed" -eq 1 ]` block, add the shell step-report:

```bash
  # Step-report: shell writes based on validation results
  local val_status val_summary
  if [ "$failed" -eq 0 ]; then
    val_status="success"
    val_summary="All 5 CI checks passed (eslint, tsc, jest, build, npm audit)"
  else
    val_status="failure"
    val_summary="One or more CI checks failed — see output above for which steps to re-run"
  fi
  write_shell_step_report "validate" "$val_status" "$val_summary" \
    "chore(${TICKET_ID}): validate checkpoint"
  commit_step_changes
  post_parent_changelog

  if [ "$failed" -eq 1 ]; then
```

- [ ] **Step 2: Wire into `cmd_deploy_ship`**

`cmd_deploy_ship` has a `case "$ci_status"` block. The `success` branch transitions subtask to Done; `failure` branches call fix agents and push. The step-report should be written at the **end of the `success` branch** only (ship is a polling step — only report once CI is actually green).

In the `success)` case branch (around line 1879–1891), before `jira_transition_to "$subtask_key" "Done"`:

```bash
    success)
      local pr_url
      pr_url=$(gh pr view "$pr_number" --json url --jq '.url' 2>/dev/null)
      echo "✅ All CI checks passed! PR is ready to merge."
      echo ""
      echo "  No auto-merge (Fortune 500 compliance — human approval required)."
      echo "  Merge command:"
      echo "    gh pr merge $pr_number --squash --delete-branch"
      echo ""
      echo "  PR: $pr_url"

      # Step-report: shell writes on CI-green success              ← ADD
      write_shell_step_report "deploy-ship" "success" \            ← ADD
        "CI all-green. PR #${pr_number} ready to merge: $pr_url" \ ← ADD
        "chore(${TICKET_ID}): deploy-ship checkpoint"              ← ADD
      commit_step_changes                                          ← ADD
      post_parent_changelog                                        ← ADD

      jira_add_comment "$subtask_key" \
```

- [ ] **Step 3: Verify parse**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire shell-written step-report into cmd_validate and cmd_deploy_ship"
```

---

## Task 9: Update `requirements-agent` and `design-agent` instructions

**Files:**

- Modify: `agents/requirements-agent/instructions.md`
- Modify: `agents/design-agent/instructions.md`

- [ ] **Step 1: Append step-report section to `requirements-agent/instructions.md`**

Add this section at the very end of the file:

````markdown
---

## Final Step: Write Step Report

After completing all steps above, write the following JSON exactly to
`docs/features/{TICKET_ID}/.step-report.json` (overwrite if it exists):

```json
{
  "step": "requirements",
  "status": "success",
  "summary": "<one sentence: e.g. 'Wrote requirements.md with 5 ACs and 4 edge cases'>",
  "files_changed": ["docs/features/{TICKET_ID}/requirements.md"],
  "validation": {
    "acceptance_criteria": "<count>",
    "edge_cases": "<count>",
    "open_questions": "<count>"
  },
  "commit_message": "docs({TICKET_ID}): requirements checkpoint"
}
```
````

Rules:

- Set `status` to `"failure"` and include `[FAILED]` in `commit_message` subject if any prior step failed (e.g. `"docs({TICKET_ID}): [FAILED] requirements checkpoint"`).
- Do not include fields not listed above.
- Write the file using your file-write tool — do not print it to stdout.

````

- [ ] **Step 2: Append step-report section to `design-agent/instructions.md`**

Add this section at the very end of the file:

```markdown
---

## Final Step: Write Step Report

After completing all steps above, write the following JSON exactly to
`docs/features/{TICKET_ID}/.step-report.json` (overwrite if it exists):

```json
{
  "step": "design",
  "status": "success",
  "summary": "<one sentence: e.g. 'Wrote TDD.md with API contract, schema changes, and sequence diagram'>",
  "files_changed": [
    "docs/features/{TICKET_ID}/TDD.md"
  ],
  "validation": {
    "api_changes": "<yes/no>",
    "schema_changes": "<yes/no>",
    "open_decisions": "<count>"
  },
  "commit_message": "docs({TICKET_ID}): design checkpoint"
}
````

Rules:

- Set `status` to `"failure"` and include `[FAILED]` in `commit_message` subject if any prior step failed.
- Do not include fields not listed above.
- Write the file using your file-write tool — do not print it to stdout.

````

- [ ] **Step 3: Commit**

```bash
git add agents/requirements-agent/instructions.md agents/design-agent/instructions.md
git commit -m "docs(agents): add step-report write instructions to requirements and design agents"
````

---

## Task 10: Update `code-impl-agent` instructions

**Files:**

- Modify: `agents/code-impl-agent/instructions.md`

- [ ] **Step 1: Append step-report section**

Add at the very end of `agents/code-impl-agent/instructions.md`:

````markdown
---

## Final Step: Write Step Report

After completing all steps above, write the following JSON exactly to
`docs/features/{TICKET_ID}/.step-report.json` (overwrite if it exists):

```json
{
  "step": "code-impl",
  "status": "success",
  "summary": "<one sentence: e.g. 'Scaffolded order-service controller, routes, DTOs and Zod schemas'>",
  "files_changed": ["<exact path of every file you created or modified>"],
  "validation": {
    "impl_checklist_pass": "yes"
  },
  "commit_message": "feat(<service-name>): <brief description> [{TICKET_ID}]"
}
```
````

Rules:

- `<service-name>` is the Nx app or library directory name (e.g. `order-service`, `vyasa-rag-service`).
- List every file you wrote or changed in `files_changed`.
- Set `status` to `"failure"` and add `[FAILED]` in the commit_message subject if IMPL_CHECKLIST.md has ❌ items.
- Write the file using your file-write tool — do not print it to stdout.

````

- [ ] **Step 2: Commit**

```bash
git add agents/code-impl-agent/instructions.md
git commit -m "docs(agents): add step-report write instructions to code-impl agent"
````

---

## Task 11: Update `code-security-agent`, `code-perf-agent`, and `deploy-agent` instructions

**Files:**

- Modify: `agents/code-security-agent/instructions.md`
- Modify: `agents/code-perf-agent/instructions.md`
- Modify: `agents/deploy-agent/instructions.md`

- [ ] **Step 1: Append step-report section to `code-security-agent/instructions.md`**

Add at the very end:

````markdown
---

## Final Step: Write Step Report

After completing all steps above, write the following JSON exactly to
`docs/features/{TICKET_ID}/.step-report.json` (overwrite if it exists):

```json
{
  "step": "code-security",
  "status": "success",
  "summary": "<one sentence: e.g. 'OWASP review passed — no critical findings; 1 low-severity finding documented'>",
  "files_changed": [
    "<every file you modified to remediate findings>",
    "docs/features/{TICKET_ID}/SECURITY_REVIEW.md"
  ],
  "validation": {
    "overall_verdict": "<PASS or FAIL>",
    "security_findings": "<count of findings>",
    "npm_audit_high": "<yes/no>"
  },
  "commit_message": "security(<service-name>): security review [${TICKET_ID}]"
}
```
````

Rules:

- Set `status` to `"failure"` if overall verdict is FAIL. Add `[FAILED]` in commit_message subject.
- Write the file using your file-write tool — do not print it to stdout.

````

- [ ] **Step 2: Append step-report section to `code-perf-agent/instructions.md`**

Add at the very end:

```markdown
---

## Final Step: Write Step Report

After completing all steps above, write the following JSON exactly to
`docs/features/{TICKET_ID}/.step-report.json` (overwrite if it exists):

```json
{
  "step": "code-perf",
  "status": "success",
  "summary": "<one sentence: e.g. 'N+1 review complete — 2 cache opportunities identified and addressed'>",
  "files_changed": [
    "<every file you modified for performance improvements>"
  ],
  "validation": {
    "n_plus_1_issues": "<count found/fixed>",
    "cache_opportunities": "<count>",
    "e2e_stubs_added": "<yes/no>"
  },
  "commit_message": "perf(<service-name>): performance review [{TICKET_ID}]"
}
````

Rules:

- Set `status` to `"failure"` if critical perf regressions were found and not resolved.
- Write the file using your file-write tool — do not print it to stdout.

````

- [ ] **Step 3: Append step-report section to `deploy-agent/instructions.md`**

Add at the very end:

```markdown
---

## Final Step: Write Step Report

After completing the git commit and PR creation above, write the following JSON exactly to
`docs/features/{TICKET_ID}/.step-report.json` (overwrite if it exists):

```json
{
  "step": "deploy-pr",
  "status": "success",
  "summary": "<one sentence: e.g. 'Opened PR #42 on feature/SCRUM-42-order-service — CI checks triggered'>",
  "files_changed": [],
  "validation": {
    "pr_number": "<PR number>",
    "ci_status": "<success/pending/failure/unknown>"
  },
  "commit_message": "chore({TICKET_ID}): deploy-pr checkpoint"
}
````

Rules:

- `files_changed` is always `[]` for deploy-pr (the implementation commits already happened in earlier steps).
- Set `status` to `"failure"` if PR creation failed.
- Write the file using your file-write tool — do not print it to stdout.

````

- [ ] **Step 4: Commit**

```bash
git add agents/code-security-agent/instructions.md agents/code-perf-agent/instructions.md agents/deploy-agent/instructions.md
git commit -m "docs(agents): add step-report write instructions to code-security, code-perf, deploy agents"
````

---

## Task 12: Manual smoke test (dry run with mock step-report)

This task verifies the three shell helper functions work end-to-end without a real Jira connection.

**Files:** None (no changes)

- [ ] **Step 1: Create a mock step-report and test commit_step_changes**

Run in the repo root (on a clean branch — the test creates a dummy file):

```bash
# Create a temp file to stage
echo "test" > /tmp/ai-dev-smoke-test-file.txt
cp /tmp/ai-dev-smoke-test-file.txt docs/features/.smoke-test-artifact

# Write a valid step-report (TICKET_ID must match an existing feature dir or create one)
mkdir -p docs/features/SMOKE-1
cat > docs/features/SMOKE-1/.step-report.json <<'EOF'
{
  "step": "requirements",
  "status": "success",
  "summary": "Smoke test — wrote requirements.md",
  "files_changed": ["docs/features/SMOKE-1/.step-report.json"],
  "validation": { "acceptance_criteria": "3" },
  "commit_message": "docs(SMOKE-1): requirements checkpoint"
}
EOF

# Source helpers and test validate + commit
(
  set -euo pipefail
  REPO_ROOT="$(pwd)"
  TICKET_ID="SMOKE-1"
  source <(awk '/^# Step-Report Helpers/,/^# ══.*Jira REST/' scripts/ai-dev.sh | head -n -2)
  validate_step_report && echo "validate_step_report: PASS" || echo "validate_step_report: FAIL"
)
```

Expected: `validate_step_report: PASS`

- [ ] **Step 2: Verify commit_step_changes produces a valid git commit**

```bash
(
  set -euo pipefail
  REPO_ROOT="$(pwd)"
  TICKET_ID="SMOKE-1"
  source <(awk '/^# Step-Report Helpers/,/^# ══.*Jira REST/' scripts/ai-dev.sh | head -n -2)
  # Stage the test artifact
  git add docs/features/SMOKE-1/.step-report.json
  commit_step_changes && echo "commit_step_changes: PASS" || echo "commit_step_changes: FAIL"
)
git log --oneline -1
```

Expected: last commit message is `docs(SMOKE-1): requirements checkpoint`

- [ ] **Step 3: Verify write_shell_step_report produces valid JSON**

```bash
(
  set -euo pipefail
  REPO_ROOT="$(pwd)"
  TICKET_ID="SMOKE-1"
  source <(awk '/^# Step-Report Helpers/,/^# ══.*Jira REST/' scripts/ai-dev.sh | head -n -2)
  write_shell_step_report "validate" "success" "All 5 checks passed" \
    "chore(SMOKE-1): validate checkpoint" \
    "lint_errors=0" "type_errors=0"
  jq . docs/features/SMOKE-1/.step-report.json && echo "write_shell_step_report: PASS"
)
```

Expected: valid JSON printed, `write_shell_step_report: PASS`

- [ ] **Step 4: Clean up smoke test artifacts**

```bash
git revert HEAD --no-edit  # undo the smoke-test commit
rm -rf docs/features/SMOKE-1
```

- [ ] **Step 5: Final parse check**

```bash
bash -n scripts/ai-dev.sh && echo "Parse: PASS"
```

Expected: `Parse: PASS`

- [ ] **Step 6: Final commit**

```bash
git add CHANGELOG.md
# Update CHANGELOG.md first with the new feature entry under [Unreleased]
git commit -m "docs: add step-level changelog and commit to CHANGELOG"
```

---

## Self-Review

### Spec Coverage Check

| Spec requirement                          | Task that covers it                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --- | ------------------ |
| All 10 steps get commit + Jira update     | Tasks 2–8 wire all cmd\_\* functions                                                                          |
| Always for both success and failure       | write_shell_step_report sets status before gate exits; agent-written reports committed before gate check runs |
| Structured Jira parent comment            | Task 1: `post_parent_changelog` with labeled sections                                                         |
| Step-mapped commit types                  | Task 9–11: each agent instruction specifies the correct type                                                  |
| Hybrid: agent writes JSON, shell executes | Tasks 1 (helpers) + 9–11 (agent instructions)                                                                 |
| `validate_step_report` guard              | Task 1: jq validation + Conventional Commits regex check                                                      |
| Files list capped at 10                   | Task 1: `post_parent_changelog` uses `jq .files_changed[0:9]`                                                 |
| `deploy-pr` double-commit guard           | Task 7: `commit_step_changes` checks `git diff --cached --quiet`                                              |
| Shell-driven steps write JSON directly    | Tasks 4 (code-test), 5 (code-quality), 8 (validate, deploy-ship)                                              |
| Jira failure non-fatal                    | Task 1: `post_parent_changelog` uses `                                                                        |     | echo "Warning..."` |

### No Placeholders

All code steps include complete bash code. All agent instruction steps include complete JSON templates with field-level rules.

### Type Consistency

- `write_shell_step_report` signature: `<step> <status> <summary> <commit_message> [key=value...]` — used consistently in Tasks 4, 5, 8.
- `validate_step_report` / `commit_step_changes` / `post_parent_changelog` — all rely on `$(feature_dir)/.step-report.json` — consistent path used in Task 1 and all wiring tasks.
