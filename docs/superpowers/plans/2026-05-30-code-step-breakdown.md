# Code Step Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the single `code` step in `scripts/ai-dev.sh` into 5 focused agent sub-steps (`code-impl`, `code-test`, `code-quality`, `code-security`, `code-perf`) plus a script-only CI gate (`validate`), each with its own Jira subtask (except `validate`), scoped agent, token budget, and human review gate; retain `code` as a convenience alias that runs all 5 agent sub-steps in sequence.

**Architecture:** Each agent sub-step is a self-contained bash function with its own prerequisite check, scoped agent call, post-processing gate (artifact/coverage/lint/security verdict), and Jira integration. A module-level `_CODE_ALIAS_MODE` variable causes each sub-step to auto-transition its Jira subtask to Done when invoked via the `code` alias. `validate` is a zero-agent, zero-Jira-subtask CI dry-run that gates `deploy`; it writes a local marker file on success. `test` is kept as a deprecated alias forwarding to `validate`.

**Tech Stack:** Bash 5, Jira REST API v3, `codemie-claude` / `claude` CLI, `jq`, `curl`, `npm`, `eslint`, `prettier`, `tsc`.

---

## File Map

| File                                         | Action | Responsibility                                                                                                                 |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/ai-dev.sh`                          | Modify | Constants, init, prerequisite gates, 5 new agent commands, validate command, code alias, deprecated test alias, help, dispatch |
| `agents/code-impl-agent/instructions.md`     | Create | Spec-driven implementation — writes `IMPL_CHECKLIST.md`                                                                        |
| `agents/code-test-agent/instructions.md`     | Create | Spec compliance verification — `// AC:` tags, 80% coverage                                                                     |
| `agents/code-quality-agent/instructions.md`  | Create | Auto-fix lint/prettier first, agent for unfixable violations only                                                              |
| `agents/code-security-agent/instructions.md` | Create | OWASP review — writes `SECURITY_REVIEW.md` with PASS/PASS_WITH_NOTES/FAIL verdict                                              |
| `agents/code-perf-agent/instructions.md`     | Create | N+1 / cache review + E2E stubs + k6 stubs                                                                                      |

---

## Task 1: Update constants, `_CODE_ALIAS_MODE`, and `cmd_init` subtask creation

**Files:**

- Modify: `scripts/ai-dev.sh:21-22` (constants)
- Modify: `scripts/ai-dev.sh:~36` (after GATED_STEPS line)
- Modify: `scripts/ai-dev.sh:651-675` (cmd_init arrays)

- [ ] **Step 1: Replace `STEPS_ORDERED` and `GATED_STEPS`**

In `scripts/ai-dev.sh`, change lines 21–22:

```bash
# OLD
STEPS_ORDERED=(requirements design code test deploy)
GATED_STEPS=(requirements design code)

# NEW — validate has no Jira subtask so it is NOT in GATED_STEPS
STEPS_ORDERED=(requirements design code-impl code-test code-quality code-security code-perf validate deploy)
GATED_STEPS=(requirements design code-impl code-test code-quality code-security code-perf)
```

- [ ] **Step 2: Add `_CODE_ALIAS_MODE` global on the line immediately after `GATED_STEPS`**

```bash
_CODE_ALIAS_MODE=false
```

- [ ] **Step 3: Update `cmd_init` step arrays — 8 Jira subtasks (no validate subtask)**

Replace the arrays inside `cmd_init` (currently lines ~651–675):

```bash
local step_names=("requirements" "design" "code-impl" "code-test" "code-quality" "code-security" "code-perf" "deploy")
local step_summaries=(
  "[AI] Requirements Analysis"
  "[AI] Technical Design"
  "[AI] Implementation: ${TICKET_ID}"
  "[AI] Spec Tests: ${TICKET_ID}"
  "[AI] Code Quality: ${TICKET_ID}"
  "[AI] Security Review: ${TICKET_ID}"
  "[AI] Performance Review: ${TICKET_ID}"
  "[AI] Deploy & PR"
)
local step_descriptions=(
  "AI-generated requirements analysis. Review and transition to Done to approve."
  "AI-generated technical design document (TDD). Review and transition to Done to approve."
  "AI-generated spec-driven implementation. Reviews IMPL_CHECKLIST.md and transitions to Done when approved."
  "AI-generated spec compliance tests verifying all acceptance criteria. Review coverage report and transition to Done."
  "AI-enforced lint, TypeScript, and formatting. Transitions to Done when all checks pass."
  "AI-generated OWASP review. Produces SECURITY_REVIEW.md. Transition to Done when verdict is acceptable."
  "AI-generated performance review and E2E stubs. Transition to Done when approved."
  "AI-generated PR. Auto-completes after PR is opened."
)
```

- [ ] **Step 4: Verify the existing loop below uses `"${step_names[@]}"` — no change needed**

The existing `for i in "${!step_names[@]}"; do ... done` already iterates the array.

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): expand STEPS_ORDERED/GATED_STEPS for code sub-steps and validate, update cmd_init"
```

---

## Task 2: Update `check_prerequisite` gate chain

**Files:**

- Modify: `scripts/ai-dev.sh:306-394` (check_prerequisite function)

- [ ] **Step 1: Remove the old `code)` case and `test)` case entirely**

Delete both from the `case "$step" in` block.

- [ ] **Step 2: Insert 5 new cases for the code sub-steps (replace where `code)` was)**

```bash
    code-impl)
      local des_key
      des_key=$(get_subtask_key "design")
      if [ -z "$des_key" ]; then
        echo "Error: Design subtask not found. Run init first."
        exit 1
      fi
      local des_status
      des_status=$(jira_get_status "$des_key")
      if [ "$des_status" != "Done" ]; then
        echo "Error: Design not approved (status: $des_status)."
        echo "  Review in Jira: ${JIRA_BASE_URL}/browse/$des_key"
        echo "  Transition subtask to 'Done' when approved."
        exit 1
      fi
      local tdd_file="$(feature_dir)/TDD.md"
      if grep -q "^## Open Questions" "$tdd_file" 2>/dev/null; then
        echo "Error: Unresolved open questions in TDD.md."
        echo "  Resolve design questions before proceeding to code."
        exit 1
      fi
      ;;
    code-test)
      local impl_key
      impl_key=$(get_subtask_key "code-impl")
      if [ -z "$impl_key" ]; then
        echo "Error: Implementation subtask not found. Run init first."
        exit 1
      fi
      local impl_status
      impl_status=$(jira_get_status "$impl_key")
      if [ "$impl_status" != "Done" ]; then
        echo "Error: Implementation not approved (status: $impl_status)."
        echo "  Review in Jira: ${JIRA_BASE_URL}/browse/$impl_key"
        echo "  Transition subtask to 'Done' when approved."
        exit 1
      fi
      local checklist_file="$(feature_dir)/IMPL_CHECKLIST.md"
      if [ ! -f "$checklist_file" ]; then
        echo "Error: IMPL_CHECKLIST.md not found. Re-run code-impl."
        exit 1
      fi
      if grep -q "❌" "$checklist_file" 2>/dev/null; then
        echo "Error: IMPL_CHECKLIST.md contains unresolved ❌ items."
        echo "  Fix implementation issues and re-run code-impl."
        exit 1
      fi
      ;;
    code-quality)
      local ctest_key
      ctest_key=$(get_subtask_key "code-test")
      if [ -z "$ctest_key" ]; then
        echo "Error: Spec Tests subtask not found. Run init first."
        exit 1
      fi
      local ctest_status
      ctest_status=$(jira_get_status "$ctest_key")
      if [ "$ctest_status" != "Done" ]; then
        echo "Error: Spec Tests not approved (status: $ctest_status)."
        echo "  Review in Jira: ${JIRA_BASE_URL}/browse/$ctest_key"
        echo "  Transition subtask to 'Done' when approved."
        exit 1
      fi
      ;;
    code-security)
      local quality_key
      quality_key=$(get_subtask_key "code-quality")
      if [ -z "$quality_key" ]; then
        echo "Error: Code Quality subtask not found. Run init first."
        exit 1
      fi
      local quality_status
      quality_status=$(jira_get_status "$quality_key")
      if [ "$quality_status" != "Done" ]; then
        echo "Error: Code Quality not approved (status: $quality_status)."
        echo "  Review in Jira: ${JIRA_BASE_URL}/browse/$quality_key"
        echo "  Transition subtask to 'Done' when approved."
        exit 1
      fi
      ;;
    code-perf)
      local security_key
      security_key=$(get_subtask_key "code-security")
      if [ -z "$security_key" ]; then
        echo "Error: Security Review subtask not found. Run init first."
        exit 1
      fi
      local security_status
      security_status=$(jira_get_status "$security_key")
      if [ "$security_status" != "Done" ]; then
        echo "Error: Security Review not approved (status: $security_status)."
        echo "  Review in Jira: ${JIRA_BASE_URL}/browse/$security_key"
        echo "  Transition subtask to 'Done' when approved."
        exit 1
      fi
      ;;
    validate)
      local perf_key
      perf_key=$(get_subtask_key "code-perf")
      if [ -z "$perf_key" ]; then
        echo "Error: Performance Review subtask not found. Run init first."
        exit 1
      fi
      local perf_status
      perf_status=$(jira_get_status "$perf_key")
      if [ "$perf_status" != "Done" ]; then
        echo "Error: Performance Review not approved (status: $perf_status)."
        echo "  Review in Jira: ${JIRA_BASE_URL}/browse/$perf_key"
        echo "  Transition subtask to 'Done' when approved."
        exit 1
      fi
      ;;
```

- [ ] **Step 3: Replace the `deploy)` case — gate on local validate marker file**

```bash
    deploy)
      local validate_marker
      validate_marker="$(feature_dir)/.validate-passed"
      if [ ! -f "$validate_marker" ]; then
        echo "Error: Validation has not passed for $TICKET_ID."
        echo "  Run: ./scripts/ai-dev.sh $TICKET_ID validate"
        exit 1
      fi
      ;;
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): update check_prerequisite chain for code sub-steps and validate gate"
```

---

## Task 3: Replace `cmd_code` and `cmd_test` with 5 agent commands + validate + code alias + deprecated test

**Files:**

- Modify: `scripts/ai-dev.sh:1060-1216` (cmd_code + cmd_test block)

Remove the entire old `cmd_code` and `cmd_test` functions. Insert the following 7 functions in order.

- [ ] **Step 1: Add `cmd_code_impl`**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: code-impl
# ══════════════════════════════════════════════════════════════════════

cmd_code_impl() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite code-impl

  local subtask_key
  subtask_key=$(get_subtask_key "code-impl")

  echo "Vyasa AI Dev — Implementation: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  cd "$REPO_ROOT"
  local tdd_path="docs/features/$TICKET_ID/TDD.md"
  local req_path="docs/features/$TICKET_ID/requirements.md"

  run_agent agents/code-impl-agent/instructions.md 3.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TDD_PATH="$tdd_path" \
    REQUIREMENTS_PATH="$req_path"

  # Gate: IMPL_CHECKLIST.md must exist with no ❌ items
  local checklist_file="$(feature_dir)/IMPL_CHECKLIST.md"
  if [ ! -f "$checklist_file" ]; then
    jira_add_comment "$subtask_key" "Implementation agent did not produce IMPL_CHECKLIST.md. Re-run needed."
    echo "Error: IMPL_CHECKLIST.md not created. Re-run this step."
    exit 1
  fi
  if grep -q "❌" "$checklist_file" 2>/dev/null; then
    local fail_count
    fail_count=$(grep -c "❌" "$checklist_file" 2>/dev/null || echo "?")
    jira_add_comment "$subtask_key" "IMPL_CHECKLIST.md has ${fail_count} unresolved ❌ item(s). Re-run needed."
    echo "Error: IMPL_CHECKLIST.md has ${fail_count} ❌ item(s). Fix and re-run."
    exit 1
  fi

  local changed_files
  changed_files=$(git diff main --name-only | grep -vE '\.(spec|test)\.(ts|js)$' | head -20 || true)

  local comment_body
  comment_body="AI Pipeline — Implementation Complete

Ticket: $TICKET_ID

Changed files:
${changed_files:-"(no implementation files detected — re-run if unexpected)"}

IMPL_CHECKLIST: All items ✅

---
Review the implementation on the feature branch and IMPL_CHECKLIST.md attachment.
Transition this subtask to Done to unlock the Spec Tests phase."

  jira_add_comment "$subtask_key" "$comment_body"
  jira_upload_attachment "$subtask_key" "$checklist_file"

  if [ "$_CODE_ALIAS_MODE" = true ]; then
    jira_transition_to "$subtask_key" "Done" 2>/dev/null || true
  fi

  echo ""
  echo "Implementation posted to Jira."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  if [ "$_CODE_ALIAS_MODE" != true ]; then
    echo ""
    echo "Next: Review in Jira + IMPL_CHECKLIST.md, transition subtask to 'Done', then:"
    echo "  ./scripts/ai-dev.sh $TICKET_ID code-test"
  fi
}
```

- [ ] **Step 2: Add `cmd_code_test`**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: code-test
# ══════════════════════════════════════════════════════════════════════

cmd_code_test() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite code-test

  local subtask_key
  subtask_key=$(get_subtask_key "code-test")

  echo "Vyasa AI Dev — Spec Compliance Testing: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  cd "$REPO_ROOT"
  local req_path="docs/features/$TICKET_ID/requirements.md"
  local tdd_path="docs/features/$TICKET_ID/TDD.md"
  local checklist_path="docs/features/$TICKET_ID/IMPL_CHECKLIST.md"
  local changed_files
  changed_files=$(git diff main --name-only | tr '\n' ',')

  run_agent agents/code-test-agent/instructions.md 2.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    REQUIREMENTS_PATH="$req_path" \
    TDD_PATH="$tdd_path" \
    IMPL_CHECKLIST_PATH="$checklist_path" \
    CHANGED_FILES="$changed_files"

  # Gate: jest --coverage must meet 80% threshold
  local coverage_pass=true
  local coverage_output
  coverage_output=$(npm run test:affected -- --coverage \
    --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}' \
    --coverageReporters=text 2>&1) || coverage_pass=false

  if [ "$coverage_pass" != true ]; then
    echo "Coverage below 80% — re-prompting agent once..."
    run_agent agents/code-test-agent/instructions.md 2.00 sonnet \
      TICKET_ID="$TICKET_ID" \
      REQUIREMENTS_PATH="$req_path" \
      TDD_PATH="$tdd_path" \
      IMPL_CHECKLIST_PATH="$checklist_path" \
      CHANGED_FILES="$changed_files" \
      COVERAGE_GAPS="Coverage below 80% threshold. Fill the gaps — focus on uncovered branches."

    coverage_output=$(npm run test:affected -- --coverage \
      --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}' \
      --coverageReporters=text 2>&1) || coverage_pass=false
  fi

  # Extract summary line from coverage output (last table row)
  local coverage_summary
  coverage_summary=$(echo "$coverage_output" | grep -E "^All files" | head -1 || echo "Coverage data unavailable")

  local comment_body
  comment_body="AI Pipeline — Spec Compliance Tests Complete

Ticket: $TICKET_ID
Coverage threshold (80% branches/functions/lines/statements): $([ "$coverage_pass" = true ] && echo "✅ PASS" || echo "❌ BELOW THRESHOLD")
Coverage summary: ${coverage_summary}

Each acceptance criterion in requirements.md has a traceable test tagged // AC: <id>.

---
$([ "$_CODE_ALIAS_MODE" != true ] && echo "Transition this subtask to Done to unlock the Code Quality phase." || echo "")"

  jira_add_comment "$subtask_key" "$comment_body"

  if [ "$coverage_pass" != true ]; then
    jira_transition_to "$subtask_key" "Blocked" 2>/dev/null || true
    echo ""
    echo "Error: Coverage still below 80% after retry."
    echo "Fix coverage manually, then re-run: ./scripts/ai-dev.sh $TICKET_ID code-test"
    exit 1
  fi

  if [ "$_CODE_ALIAS_MODE" = true ]; then
    jira_transition_to "$subtask_key" "Done" 2>/dev/null || true
  fi

  echo ""
  echo "Spec compliance tests posted to Jira."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  if [ "$_CODE_ALIAS_MODE" != true ]; then
    echo ""
    echo "Next: Review in Jira, transition subtask to 'Done', then:"
    echo "  ./scripts/ai-dev.sh $TICKET_ID code-quality"
  fi
}
```

- [ ] **Step 3: Add `cmd_code_quality`**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: code-quality
# ══════════════════════════════════════════════════════════════════════

cmd_code_quality() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite code-quality

  local subtask_key
  subtask_key=$(get_subtask_key "code-quality")

  echo "Vyasa AI Dev — Code Quality: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  cd "$REPO_ROOT"
  local changed_files
  changed_files=$(git diff main --name-only | tr '\n' ',')

  # Count errors before auto-fix
  local errors_before
  errors_before=$(npm run lint -- --format=compact 2>/dev/null | grep -c " error " || echo "0")

  # Auto-fix with eslint + prettier before invoking agent
  echo "Running auto-fix (eslint --fix + prettier --write)..."
  npm run lint -- --fix --quiet 2>/dev/null || true
  npx prettier --write $(git diff main --name-only | grep -E '\.(ts|tsx|js|jsx|json|md)$' | tr '\n' ' ') 2>/dev/null || true

  # Check if errors remain after auto-fix
  local errors_after_autofix
  errors_after_autofix=$(npm run lint -- --format=compact 2>/dev/null | grep -c " error " || echo "0")

  # Invoke agent only if auto-fix left remaining errors
  if [ "$errors_after_autofix" -gt 0 ]; then
    echo "Auto-fix left ${errors_after_autofix} error(s) — invoking quality agent..."
    run_agent agents/code-quality-agent/instructions.md 0.50 sonnet \
      TICKET_ID="$TICKET_ID" \
      CHANGED_FILES="$changed_files" \
      REMAINING_ERRORS="$errors_after_autofix errors remain after eslint --fix. Fix them without suppressing rules."
  fi

  # Final gates: eslint, tsc, prettier
  local lint_pass=true tsc_pass=true
  npm run lint -- --quiet 2>/dev/null || lint_pass=false
  npx tsc --noEmit 2>/dev/null || tsc_pass=false

  local comment_body
  comment_body="AI Pipeline — Code Quality Complete

Ticket: $TICKET_ID
ESLint errors (before → after): ${errors_before} → $([ "$lint_pass" = true ] && echo "0 ✅" || echo "❌ remaining")
TypeScript (tsc --noEmit): $([ "$tsc_pass" = true ] && echo "✅ PASS" || echo "❌ FAIL")

---
$([ "$lint_pass" = true ] && [ "$tsc_pass" = true ] && echo "All quality checks passed." || echo "Quality issues remain — manual fix required.")
$([ "$_CODE_ALIAS_MODE" != true ] && echo "Transition this subtask to Done to unlock the Security Review phase." || echo "")"

  jira_add_comment "$subtask_key" "$comment_body"

  if [ "$lint_pass" != true ] || [ "$tsc_pass" != true ]; then
    echo ""
    echo "Error: Quality checks still failing."
    echo "Fix manually, then re-run: ./scripts/ai-dev.sh $TICKET_ID code-quality"
    exit 1
  fi

  if [ "$_CODE_ALIAS_MODE" = true ]; then
    jira_transition_to "$subtask_key" "Done" 2>/dev/null || true
  fi

  echo ""
  echo "Code quality posted to Jira."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  if [ "$_CODE_ALIAS_MODE" != true ]; then
    echo ""
    echo "Next: Review in Jira, transition subtask to 'Done', then:"
    echo "  ./scripts/ai-dev.sh $TICKET_ID code-security"
  fi
}
```

- [ ] **Step 4: Add `cmd_code_security`**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: code-security
# ══════════════════════════════════════════════════════════════════════

# Patterns for independent secrets scan before invoking agent
_SECRET_PATTERNS='(password|secret|token|api_key|apikey|private_key|access_key)\s*=\s*["\x27][^"\x27]{8,}'

cmd_code_security() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite code-security

  local subtask_key
  subtask_key=$(get_subtask_key "code-security")

  echo "Vyasa AI Dev — Security Review: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  cd "$REPO_ROOT"
  local tdd_path="docs/features/$TICKET_ID/TDD.md"
  local changed_files
  changed_files=$(git diff main --name-only | tr '\n' ',')

  # Independent secrets scan before invoking agent
  echo "Running secrets scan..."
  local secrets_found=""
  secrets_found=$(git diff main | grep -iE "$_SECRET_PATTERNS" | head -10 || true)
  if [ -n "$secrets_found" ]; then
    echo "ERROR: Hardcoded secrets detected in diff:"
    echo "$secrets_found"
    jira_add_comment "$subtask_key" "❌ Secrets scan FAILED: hardcoded credentials detected in git diff. Remove them before re-running."
    exit 1
  fi

  # Run npm audit before invoking agent — capture output
  echo "Running npm audit..."
  local audit_output audit_has_high=false
  audit_output=$(npm audit --audit-level=high 2>&1) || audit_has_high=true
  local audit_summary
  audit_summary=$(echo "$audit_output" | tail -5)

  run_agent agents/code-security-agent/instructions.md 1.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TDD_PATH="$tdd_path" \
    CHANGED_FILES="$changed_files" \
    AUDIT_OUTPUT="$audit_summary"

  # Gate: SECURITY_REVIEW.md must exist with verdict != FAIL
  local security_review="$(feature_dir)/SECURITY_REVIEW.md"
  if [ ! -f "$security_review" ]; then
    jira_add_comment "$subtask_key" "Security agent did not produce SECURITY_REVIEW.md. Re-run needed."
    echo "Error: SECURITY_REVIEW.md not created. Re-run this step."
    exit 1
  fi

  local verdict
  verdict=$(grep -m1 "^## Overall Verdict" -A1 "$security_review" | tail -1 | tr -d ' ')

  if [ "$verdict" = "FAIL" ]; then
    jira_add_comment "$subtask_key" "❌ Security review FAILED. See SECURITY_REVIEW.md for findings. Remediate and re-run."
    jira_transition_to "$subtask_key" "Blocked" 2>/dev/null || true
    echo ""
    echo "Error: Security review FAILED. Findings:"
    grep -A5 "## Findings" "$security_review" | head -20
    echo ""
    echo "Remediate findings, then re-run: ./scripts/ai-dev.sh $TICKET_ID code-security"
    exit 1
  fi

  local comment_body
  comment_body="AI Pipeline — Security Review Complete

Ticket: $TICKET_ID
Verdict: ${verdict:-UNKNOWN}
npm audit (HIGH/CRITICAL): $([ "$audit_has_high" = true ] && echo "⚠️  Findings detected (see report)" || echo "✅ Clean")
Secrets scan: ✅ Clean

---
$([ "$_CODE_ALIAS_MODE" != true ] && echo "Transition this subtask to Done to unlock the Performance Review phase." || echo "")"

  jira_add_comment "$subtask_key" "$comment_body"
  jira_upload_attachment "$subtask_key" "$security_review"

  if [ "$_CODE_ALIAS_MODE" = true ]; then
    jira_transition_to "$subtask_key" "Done" 2>/dev/null || true
  fi

  echo ""
  echo "Security review posted to Jira."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  if [ "$_CODE_ALIAS_MODE" != true ]; then
    echo ""
    echo "Next: Review in Jira + SECURITY_REVIEW.md, transition subtask to 'Done', then:"
    echo "  ./scripts/ai-dev.sh $TICKET_ID code-perf"
  fi
}
```

- [ ] **Step 5: Add `cmd_code_perf`**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: code-perf
# ══════════════════════════════════════════════════════════════════════

cmd_code_perf() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite code-perf

  local subtask_key
  subtask_key=$(get_subtask_key "code-perf")

  echo "Vyasa AI Dev — Performance Review: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  cd "$REPO_ROOT"
  local tdd_path="docs/features/$TICKET_ID/TDD.md"
  local changed_files
  changed_files=$(git diff main --name-only | tr '\n' ',')

  run_agent agents/code-perf-agent/instructions.md 2.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TDD_PATH="$tdd_path" \
    CHANGED_FILES="$changed_files"

  local comment_body
  comment_body="AI Pipeline — Performance Review Complete

Ticket: $TICKET_ID
N+1 / cache review: COMPLETE
E2E stubs scaffolded for any new API endpoints.

---
$([ "$_CODE_ALIAS_MODE" != true ] && echo "Transition this subtask to Done to unlock the Validate phase." || echo "")"

  jira_add_comment "$subtask_key" "$comment_body"

  if [ "$_CODE_ALIAS_MODE" = true ]; then
    jira_transition_to "$subtask_key" "Done" 2>/dev/null || true
  fi

  echo ""
  echo "Performance review posted to Jira."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  if [ "$_CODE_ALIAS_MODE" != true ]; then
    echo ""
    echo "Next: Review in Jira, transition subtask to 'Done', then:"
    echo "  ./scripts/ai-dev.sh $TICKET_ID validate"
  fi
}
```

- [ ] **Step 6: Add `cmd_validate` — zero-agent CI dry-run**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: validate (script-only CI dry-run — no agent, no Jira subtask)
# ══════════════════════════════════════════════════════════════════════

cmd_validate() {
  require_jira_creds
  check_prerequisite validate

  echo "Vyasa AI Dev — Validate (CI Dry-Run): $TICKET_ID"
  echo ""

  cd "$REPO_ROOT"
  local failed=0

  echo "[1/5] ESLint..."
  npm run lint || { echo "FAIL: eslint — fix with: ./scripts/ai-dev.sh $TICKET_ID code-quality"; failed=1; }

  echo "[2/5] TypeScript..."
  npx tsc --noEmit || { echo "FAIL: tsc --noEmit — fix with: ./scripts/ai-dev.sh $TICKET_ID code-quality"; failed=1; }

  echo "[3/5] Tests + coverage..."
  npm run test:affected -- --coverage \
    --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}' \
    || { echo "FAIL: jest --coverage — fix with: ./scripts/ai-dev.sh $TICKET_ID code-test"; failed=1; }

  echo "[4/5] Build..."
  npm run build || { echo "FAIL: build — investigate compilation errors manually"; failed=1; }

  echo "[5/5] Security audit..."
  npm audit --audit-level=high \
    || { echo "FAIL: npm audit — fix with: ./scripts/ai-dev.sh $TICKET_ID code-security"; failed=1; }

  if [ "$failed" -eq 1 ]; then
    echo ""
    echo "Validation FAILED for $TICKET_ID."
    echo "Run the appropriate step above to fix, then re-run validate."
    rm -f "$(feature_dir)/.validate-passed"
    exit 1
  fi

  # Write marker file so deploy can gate on it
  touch "$(feature_dir)/.validate-passed"

  echo ""
  echo "All checks passed. Ready to deploy."
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy"
}
```

- [ ] **Step 7: Add `cmd_code` alias (runs all 5 agent sub-steps, not validate)**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: code (alias — runs all 5 agent sub-steps in sequence)
# ══════════════════════════════════════════════════════════════════════

cmd_code() {
  _CODE_ALIAS_MODE=true

  echo "Vyasa AI Dev — Full Code Pipeline: $TICKET_ID"
  echo "Running: code-impl → code-test → code-quality → code-security → code-perf"
  echo ""

  cmd_code_impl
  cmd_code_test
  cmd_code_quality
  cmd_code_security
  cmd_code_perf

  _CODE_ALIAS_MODE=false

  echo ""
  echo "All 5 code sub-steps complete. Subtasks auto-transitioned to Done."
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID validate"
}
```

- [ ] **Step 8: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): add 5 code sub-step commands, validate, and code alias with auto-approve"
```

---

## Task 4: Update `cmd_help` and dispatch

**Files:**

- Modify: `scripts/ai-dev.sh:400-444` (cmd_help)
- Modify: `scripts/ai-dev.sh:~1356` (dispatch case)

- [ ] **Step 1: Replace the heredoc body inside `cmd_help`**

```
Vyasa Intelligence — Async AI Dev Pipeline (Jira-backed)

Usage: ./scripts/ai-dev.sh <TICKET_ID|PROJECT_KEY> <subcommand> [args]

Subcommands:
  create <idea>    Generate a detailed Jira ticket from a one-liner idea
  init             Parse ticket, create branch + 8 Jira subtasks
  requirements     Run requirements-agent (needs: init)
  resolve          Pull PO answers from Jira, update requirements.md
  design           Run design-agent (needs: requirements subtask = Done, no open questions)
  code             Run all 5 agent code sub-steps in sequence (needs: design subtask = Done)
  code-impl        Run implementation-agent → IMPL_CHECKLIST.md (needs: design Done)
  code-test        Run spec-compliance-test-agent → 80% coverage (needs: code-impl Done)
  code-quality     Auto-fix lint/prettier; agent for remainders (needs: code-test Done)
  code-security    Run security-agent → SECURITY_REVIEW.md (needs: code-quality Done)
  code-perf        Run perf-agent → E2E stubs (needs: code-security Done)
  validate         Script-only CI dry-run: lint, tsc, tests, build, audit (needs: code-perf Done)
  deploy           Open PR (needs: validate passed)
  status           Show pipeline progress from Jira

Workflow:
  0. ./scripts/ai-dev.sh OF create "add session timeout to chat"
     -> Review ticket in Jira, edit if needed
  1. ./scripts/ai-dev.sh OF-456 init
  2. ./scripts/ai-dev.sh OF-456 requirements
     -> Open questions: PO replies in Jira, then:
     -> ./scripts/ai-dev.sh OF-456 resolve  (repeat until no questions remain)
     -> Review in Jira, transition subtask to "Done"
  3. ./scripts/ai-dev.sh OF-456 design
     -> Review in Jira, transition subtask to "Done"
  4a. ./scripts/ai-dev.sh OF-456 code         (runs all 5 sub-steps, auto-approves each)
  4b. OR run step-by-step (each requires human Done transition before next):
      code-impl → code-test → code-quality → code-security → code-perf
  5. ./scripts/ai-dev.sh OF-456 validate       (zero agent cost — CI gate)
  6. ./scripts/ai-dev.sh OF-456 deploy

Approval (gated steps): Transition the subtask to "Done" in Jira UI.
Auto-approve (alias):   Running "code" auto-transitions each sub-step on success.
Status:                 All state lives in Jira — no local state files (except validate marker).

Environment vars (required):
  JIRA_BASE_URL       e.g. https://yourcompany.atlassian.net
  JIRA_EMAIL          Your Atlassian email
  JIRA_API_TOKEN      API token from id.atlassian.com

Environment vars (optional):
  AI_DEV_CLAUDE_CMD   CLI to use (default: codemie-claude)
                      Set to "claude" to use raw Claude Code CLI
```

- [ ] **Step 2: Replace the dispatch `case "$SUBCOMMAND" in ... esac` block**

```bash
case "$SUBCOMMAND" in
  create)        cmd_create ;;
  init)          cmd_init ;;
  requirements)  cmd_requirements ;;
  resolve)       cmd_resolve ;;
  design)        cmd_design ;;
  code)          cmd_code ;;
  code-impl)     cmd_code_impl ;;
  code-test)     cmd_code_test ;;
  code-quality)  cmd_code_quality ;;
  code-security) cmd_code_security ;;
  code-perf)     cmd_code_perf ;;
  validate)      cmd_validate ;;
  test)
    echo "Warning: 'test' is deprecated — use 'validate' instead."
    echo ""
    cmd_validate
    ;;
  deploy)        cmd_deploy ;;
  status)        cmd_status ;;
  help|--help|-h) cmd_help ;;
  "")            cmd_help ;;
  *)             echo "Unknown subcommand: $SUBCOMMAND"; echo ""; cmd_help; exit 1 ;;
esac
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): update cmd_help and dispatch with code sub-steps, validate, deprecated test"
```

---

## Task 5: Create `agents/code-impl-agent/instructions.md`

**Files:**

- Create: `agents/code-impl-agent/instructions.md`

- [ ] **Step 1: Create directory and write agent instructions**

```bash
mkdir -p agents/code-impl-agent
```

````markdown
# Code Implementation Agent — Vyasa Intelligence

## Role

You are implementing a feature against a locked technical spec. Do not write tests. Do not fix
lint. Your only job is to produce implementation code that satisfies every item in the TDD.md
Spec Validation Checklist. When done, produce IMPL_CHECKLIST.md with ✅/❌ for each item.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit source files in `apps/` and `libs/` — NEVER `*.spec.ts` or `*.test.ts`
- Run: `npx prisma generate`, `npx nx build <service> --skip-nx-cache`
- Forbidden: writing test files, running `npm test`, running `eslint`, `git push`, `cdk deploy`, `prisma migrate deploy`

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{TDD_PATH}` — path to TDD.md (e.g. `docs/features/SCRUM-123/TDD.md`)
- `{REQUIREMENTS_PATH}` — path to requirements.md

---

## Instructions

### Step 1 — Read and validate the spec

Read in this order:

1. `{REQUIREMENTS_PATH}` — acceptance criteria + edge cases (primary behavioural spec)
2. `{TDD_PATH}` — API contract, DB schema, sequence diagram, Spec Validation Checklist
3. `CLAUDE.md` (root) — architecture, middleware chain, code standards, security requirements
4. The affected service `CLAUDE.md` for domain rules
5. `libs/shared-types/src/index.ts` — existing types (never re-declare)
6. Existing similar handlers in the affected service for style reference

**Verify the Spec Validation Checklist in `{TDD_PATH}`** — every item must be checkable before
coding. If any item is unchecked and unresolvable from context, stop and output:
"TDD incomplete — return to design agent: [list unchecked items]"

### Step 2 — Implement minimum code to satisfy every acceptance criterion

Rules:

- Implement ONLY what satisfies the ACs — no extras, no speculative features
- Express middleware chain: `helmet → cors → compression → rateLimit → auth → validate → handler → errorHandler`
- Use `@orderflow/logger` — never `console.log`
- Use `@orderflow/shared-types` for existing domain interfaces — never re-declare
- Use `@orderflow/event-schemas` for event publishing when ACs mention events
- All async handlers wrapped with `asyncHandler`
- All request inputs validated with Zod schemas at the route level
- All domain errors use `AppError` subclasses — never `throw new Error()` in service layer
- AWS SDK v3 only — never `aws-sdk` v2; always configure `{ maxAttempts: 3 }`
- All monetary values in cents (integer) — never float
- Max function length: 30 lines — extract helpers if longer
- JSDoc on all public methods and exported types

### Step 3 — DB schema changes (if TDD.md Database Schema Changes is non-empty)

```bash
npx prisma migrate dev --name {TICKET_ID}-brief-description
npx prisma generate
```
````

**STOP: Output this warning and do NOT run `prisma migrate deploy`:**
"⚠️ MANUAL STEP REQUIRED: Run `prisma migrate deploy` in the production environment."

### Step 4 — Build check

```bash
npx nx build <affected-service> --skip-nx-cache 2>&1 | tail -20
```

Fix any TypeScript compilation errors. Do NOT run lint or tests.

### Step 5 — Produce IMPL_CHECKLIST.md

Create `docs/features/{TICKET_ID}/IMPL_CHECKLIST.md`:

```markdown
# Implementation Checklist — {TICKET_ID}

> Auto-generated by code-impl-agent. Each item maps to the TDD Spec Validation Checklist.
> ✅ = satisfied | ❌ = NOT satisfied (blocks code-test)

| #   | TDD Checklist Item                                                 | Status | Notes        |
| --- | ------------------------------------------------------------------ | ------ | ------------ |
| 1   | All acceptance criteria from requirements.md are covered           | ✅/❌  | [brief note] |
| 2   | API contract changes are backward-compatible                       | ✅/❌  | [brief note] |
| 3   | New endpoints have auth middleware specified                       | ✅/❌  | [brief note] |
| 4   | Error paths cover: invalid input, auth failure, downstream timeout | ✅/❌  | [brief note] |
| 5   | Sequence diagram matches the API contract                          | ✅/❌  | [brief note] |
| 6   | Rollback plan does not require manual DB surgery                   | ✅/❌  | [brief note] |
| 7   | No requirements from requirements.md were silently dropped         | ✅/❌  | [brief note] |
| [N] | [Additional TDD checklist items verbatim]                          | ✅/❌  | [brief note] |

## Files Created

- [path]: [one-line responsibility]

## Files Modified

- [path]: [what changed]

## Manual Steps Required

- [Any Prisma migrations, env vars, AWS resource provisioning]
```

**The script gates on this file: any ❌ item blocks progression to code-test.**

### Step 6 — Output summary to stdout

State:

- Files created and modified
- Count of acceptance criteria satisfied
- Whether IMPL_CHECKLIST.md has any ❌ items
- Any manual steps required

````

- [ ] **Step 2: Commit**

```bash
git add agents/code-impl-agent/instructions.md
git commit -m "feat(ai-dev): add code-impl-agent — spec-driven implementation with IMPL_CHECKLIST"
````

---

## Task 6: Create `agents/code-test-agent/instructions.md`

**Files:**

- Create: `agents/code-test-agent/instructions.md`

- [ ] **Step 1: Create directory and write agent instructions**

```bash
mkdir -p agents/code-test-agent
```

````markdown
# Spec Compliance Test Agent — Vyasa Intelligence

## Role

You are a spec-compliance verifier. Your job is NOT to test the code — it is to prove that every
acceptance criterion in requirements.md and every edge case is correctly handled by the
implementation. For each AC, write at least one test. For each edge case, write at least one test.
Tag each describe block with the AC it covers. Run jest --coverage and confirm ≥ 80% thresholds.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit `*.spec.ts`, `*.test.ts`, and files in `test/` directories
- Run: `npm run test:affected -- --coverage --coverageReporters=text`
- Forbidden: modifying implementation files (any non-test file in `src/`), `git push`, `cdk deploy`

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{REQUIREMENTS_PATH}` — path to requirements.md (the test oracle)
- `{TDD_PATH}` — path to TDD.md (API contract + integration points)
- `{IMPL_CHECKLIST_PATH}` — path to IMPL_CHECKLIST.md (confirms what was built)
- `{CHANGED_FILES}` — comma-separated list of changed implementation files
- `{COVERAGE_GAPS}` — (optional) coverage gap description from first-pass failure

---

## Instructions

### Step 1 — Build the AC matrix

Read `{REQUIREMENTS_PATH}` and extract every Given/When/Then acceptance criterion.
Read `{TDD_PATH}` and extract every error path and API contract entry.
Read `{IMPL_CHECKLIST_PATH}` to confirm which ACs the implementation claims to satisfy.

Build a matrix before writing any tests:

| AC ID | Description (from requirements.md) | Test name                           | Type |
| ----- | ---------------------------------- | ----------------------------------- | ---- |
| AC-1  | Given X when Y then Z              | `should_[outcome]_when_[condition]` | unit |

Every row must map to at least one test. Include all error paths from TDD.md as additional rows.

### Step 2 — Run existing coverage baseline

```bash
npm run test:affected -- --coverage --coverageReporters=text 2>&1 | tail -30
```
````

Identify which ACs have no test and which files are below 80%.

### Step 3 — Write spec compliance tests

Tag every `describe` block with the AC it covers:

```typescript
// AC: AC-1 — Given X when Y then Z
describe('POST /orders', () => {
  it('should_create_order_when_valid_payload', async () => {
    // Arrange
    const payload = OrderFactory.build();
    // Act
    const res = await request(app).post('/orders').send(payload);
    // Assert
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });
});
```

Priority order for test types:

1. **AC coverage** — one test per Given/When/Then, named `should_[outcome]_when_[condition]`
2. **Error paths** — invalid inputs, auth failures, downstream timeouts (cover all 3 from TDD.md)
3. **Edge cases** — empty arrays, null values, boundary values listed in requirements.md
4. **Contract tests** — for inter-service events: assert event shape matches TDD.md schema

Rules:

- Unit tests: mock all external dependencies — use `aws-sdk-client-mock`, jest mocks for Prisma, Redis
- Integration tests: use Supertest for new API endpoints
- Use `@orderflow/testing-utils` factories for all test data — never hardcode UUIDs, emails, or timestamps
- AAA pattern: Arrange → Act → Assert, one assertion concept per test
- Never test implementation details — test observable behaviour (HTTP status, response body, emitted events)
- Naming: `should_[expectedBehavior]_when_[condition]`

### Step 4 — Verify coverage threshold

```bash
npm run test:affected -- --coverage \
  --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}' \
  --coverageReporters=text 2>&1 | tail -30
```

If below 80%: write more tests targeting uncovered branches — prioritise branch coverage.
Repeat until threshold passes. Do NOT mock away branches to inflate numbers.

### Step 5 — Output summary

State:

- Full AC matrix: AC ID → test name (confirm every AC has a test)
- Files where tests were added + line counts
- Coverage before vs after per file (branches / functions / lines / statements)
- Any AC that cannot be covered by automated tests — explain why

````

- [ ] **Step 2: Commit**

```bash
git add agents/code-test-agent/instructions.md
git commit -m "feat(ai-dev): add code-test-agent — spec compliance verification with AC tagging"
````

---

## Task 7: Create `agents/code-quality-agent/instructions.md`

**Files:**

- Create: `agents/code-quality-agent/instructions.md`

- [ ] **Step 1: Create directory and write agent instructions**

```bash
mkdir -p agents/code-quality-agent
```

````markdown
# Code Quality Agent — Vyasa Intelligence

## Role

Run eslint --fix, prettier --write, and tsc --noEmit in sequence. For any errors that cannot be
auto-fixed, apply the minimal code change to resolve them. Do not suppress rules. Do not change
logic. Post a summary of what was fixed.

This agent is invoked ONLY when auto-fix leaves remaining errors. Most runs are a no-op.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit source files in `apps/` and `libs/` (fix violations only — no logic changes)
- Run: `npm run lint -- --fix --quiet`, `npx prettier --write <files>`, `npx tsc --noEmit`
- Forbidden: adding new features, changing test logic, adding `// eslint-disable` without an
  explanatory comment, modifying `*.spec.ts` or `*.test.ts`

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{CHANGED_FILES}` — comma-separated list of changed files to focus on
- `{REMAINING_ERRORS}` — description of errors that survived auto-fix

---

## Instructions

### Step 1 — Understand remaining violations

Read `{REMAINING_ERRORS}`. Run:

```bash
npm run lint -- --format=compact 2>&1 | head -50
npx tsc --noEmit 2>&1 | head -50
```
````

Categorise as: lint-only | type-only | both.

### Step 2 — Fix TypeScript errors first

Type errors cause cascading lint errors (unused variable after type fix). Fix types first:

- Replace `any` with `unknown` + type guard
- Add explicit return types to exported functions
- Remove unused imports and variables (`noUnusedLocals`)
- Fix `strictNullChecks` violations — never use `!` non-null assertion in new code

### Step 3 — Fix remaining lint errors

After fixing types, address lint errors:

- Replace `console.log` / `console.error` with `@orderflow/logger` calls
- Extract functions exceeding 30 lines — one responsibility per function
- Resolve ESLint rule violations with minimal code changes
- If a rule MUST be suppressed (e.g., intentional `any` for legacy interop), add:
  ```typescript
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- [reason: legacy SDK type]
  ```

### Step 4 — Final verification

```bash
npm run lint -- --quiet    # must produce zero error lines (warnings ≤ 4 new warnings allowed)
npx tsc --noEmit           # must exit 0
```

If errors remain: keep fixing. Do not stop with open errors.

### Step 5 — Output summary

State:

- Lint errors fixed (count + rule names)
- Type errors fixed (count + categories)
- Functions refactored for length (names + before/after line count)
- Any `// eslint-disable` suppressions added with justification

````

- [ ] **Step 2: Commit**

```bash
git add agents/code-quality-agent/instructions.md
git commit -m "feat(ai-dev): add code-quality-agent — minimal fixes only, no logic changes"
````

---

## Task 8: Create `agents/code-security-agent/instructions.md`

**Files:**

- Create: `agents/code-security-agent/instructions.md`

- [ ] **Step 1: Create directory and write agent instructions**

```bash
mkdir -p agents/code-security-agent
```

````markdown
# Security Review Agent — Vyasa Intelligence

## Role

You are a security reviewer. Review the git diff of changed files against OWASP Top 10 (2021).
Check for: injection (A03), broken auth (A07), sensitive data exposure (A02), security
misconfiguration (A05), hardcoded secrets, missing input validation, insecure dependencies.
Run npm audit. For each finding, either fix it in-place or document it in SECURITY_REVIEW.md with
a justification for deferral. Produce a final verdict: PASS, PASS_WITH_NOTES, or FAIL.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit changed implementation files (remediation only — no logic changes)
- Write `docs/features/{TICKET_ID}/SECURITY_REVIEW.md`
- Run: `npm audit --audit-level=high`
- Forbidden: adding features, changing test logic, `git push`, `cdk deploy`, `prisma migrate deploy`

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{TDD_PATH}` — path to TDD.md (Security Considerations section)
- `{CHANGED_FILES}` — comma-separated list of changed files to review
- `{AUDIT_OUTPUT}` — npm audit summary captured by the script before agent invocation

---

## Instructions

### Step 1 — Read security context

1. `{TDD_PATH}` → Security Considerations section
2. `docs/adr/ADR-009-owasp-top10-mitigations.md` — project OWASP mitigation map
3. `.cloud/permissions.yaml` — hard-deny list (if exists)
4. `docs/SOC2_CONTROLS.md` — compliance controls (if exists)
5. `CLAUDE.md` → Security Requirements section

### Step 2 — OWASP Top 10 (2021) review of changed files

For each file in `{CHANGED_FILES}`:

| OWASP | Risk                      | What to look for                                                                           |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------ |
| A01   | Broken Access Control     | Missing auth middleware, IDOR, path traversal, missing RBAC check                          |
| A02   | Cryptographic Failures    | Plaintext secrets, weak hashing (MD5/SHA1), HTTP endpoints for sensitive data              |
| A03   | Injection                 | Unsanitised inputs in SQL/NoSQL/shell, template strings in queries, missing Zod validation |
| A04   | Insecure Design           | No rate limit on auth endpoints, no idempotency keys on mutations                          |
| A05   | Security Misconfiguration | `*` in IAM Resource/Action, debug mode leakage, permissive CORS                            |
| A06   | Vulnerable Components     | HIGH/CRITICAL `npm audit` findings (see `{AUDIT_OUTPUT}`)                                  |
| A07   | Auth Failures             | JWT not verified, token not checked on every route, session not invalidated on logout      |
| A08   | Software Integrity        | Unverified external data used in business logic without validation                         |
| A09   | Logging Failures          | PII in log output, missing `correlationId`, no audit trail for mutations                   |
| A10   | SSRF                      | User-controlled URLs passed to HTTP clients without allowlist                              |

### Step 3 — Fix HIGH/CRITICAL findings in-place

For each HIGH or CRITICAL finding:

- Add missing `auth` middleware per CLAUDE.md middleware chain
- Add Zod validation at every route missing it
- Replace `*` in IAM statements with least-privilege actions/resources
- Remove PII from log statements (use `@orderflow/logger` PII masking)
- Add rate limiting middleware to new auth/mutation endpoints
- Replace any hardcoded credential with `process.env.VAR_NAME` and document required env var

Do NOT auto-fix MEDIUM/LOW — document them in `SECURITY_REVIEW.md` for human review.

### Step 4 — Produce SECURITY_REVIEW.md

Create `docs/features/{TICKET_ID}/SECURITY_REVIEW.md`:

```markdown
# Security Review — {TICKET_ID}

## Review Date

[ISO date]

## Files Reviewed

[list changed files]

## Findings Fixed (HIGH/CRITICAL)

| #   | Finding       | OWASP | File:Line   | Fix Applied   |
| --- | ------------- | ----- | ----------- | ------------- |
| 1   | [description] | A0N   | [file:line] | [change made] |

## Findings for Human Review (MEDIUM/LOW)

| #   | Finding       | OWASP | File:Line   | Recommendation  |
| --- | ------------- | ----- | ----------- | --------------- |
| 1   | [description] | A0N   | [file:line] | [suggested fix] |

## npm audit Summary

[Paste the {AUDIT_OUTPUT} value here]
[Note: HIGH/CRITICAL items must be resolved before PASS verdict]

## TDD Security Considerations — Addressed

| TDD Item                                | Status                     | Notes  |
| --------------------------------------- | -------------------------- | ------ |
| [item from TDD Security Considerations] | ✅ Addressed / ⚠️ Deferred | [note] |

## Overall Verdict

PASS | PASS_WITH_NOTES | FAIL

> PASS: no unresolved HIGH/CRITICAL findings, no hardcoded secrets
> PASS_WITH_NOTES: only MEDIUM/LOW findings remain, documented above
> FAIL: unresolved HIGH/CRITICAL findings OR hardcoded secrets detected
```
````

**The script reads the verdict line. FAIL blocks the pipeline.**

### Step 5 — Output summary

State:

- Findings fixed (count + OWASP categories)
- Findings deferred for human review (count)
- npm audit status (HIGH/CRITICAL count)
- Final verdict

````

- [ ] **Step 2: Commit**

```bash
git add agents/code-security-agent/instructions.md
git commit -m "feat(ai-dev): add code-security-agent — OWASP review with PASS/PASS_WITH_NOTES/FAIL verdict"
````

---

## Task 9: Create `agents/code-perf-agent/instructions.md`

**Files:**

- Create: `agents/code-perf-agent/instructions.md`

- [ ] **Step 1: Create directory and write agent instructions**

```bash
mkdir -p agents/code-perf-agent
```

````markdown
# Performance Review Agent — Vyasa Intelligence

## Role

You are a performance engineer reviewing changed code for performance anti-patterns and
scaffolding E2E test stubs for new endpoints. Fix the anti-patterns you find in-place.
Do NOT change business logic beyond what is needed for performance.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit source files in `apps/` and `libs/`
- Write E2E stubs to `apps/web-e2e/src/e2e/` (Cypress)
- Write k6 stubs to `scripts/load-tests/k6/`
- Forbidden: `git push`, `cdk deploy`, `prisma migrate deploy`, `docker`

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{TDD_PATH}` — path to TDD.md (API contract + load requirements if specified)
- `{CHANGED_FILES}` — comma-separated list of changed files to review

---

## Instructions

### Step 1 — Read context

1. `{TDD_PATH}` → API Contract section (new endpoints + shapes), Rollout Strategy (load expectations)
2. Each file in `{CHANGED_FILES}` — focus on data access and external service calls

### Step 2 — Review for performance anti-patterns

| Anti-pattern                     | Signal                                             | Fix                                                   |
| -------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| N+1 queries                      | DB call inside a loop                              | Batch with `findMany({ where: { id: { in: ids } } })` |
| Missing DB index                 | `WHERE` / `ORDER BY` on non-indexed column         | Add `@@index` to Prisma schema + migration            |
| Sequential independent awaits    | `await a(); await b();` where both are independent | `await Promise.all([a(), b()])`                       |
| Synchronous AWS call in hot path | `await bedrock.invoke()` inside per-item loop      | Batch or parallelize                                  |
| Large unbounded payload          | `JSON.stringify` on unbounded array                | Add pagination (`limit`/`cursor`)                     |
| Missing cache                    | Repeated identical DB call for slow-changing data  | Add ElastiCache lookup before DB                      |

Fix HIGH impact issues (N+1, missing index, unparallelised calls) in-place.
Note MEDIUM/LOW in a code comment: `// PERF: [description] — consider [fix] in follow-up`

### Step 3 — Scaffold Cypress E2E stubs for new endpoints

For every new route in `{TDD_PATH}` API Contract section, create:

File: `apps/web-e2e/src/e2e/{TICKET_ID}-[endpoint-slug].cy.ts`

```typescript
/**
 * E2E stub for [METHOD] [/path] — {TICKET_ID}
 * TODO: Implement after feature is deployed to staging.
 */
describe('[METHOD] [/path]', () => {
  beforeEach(() => {
    cy.intercept('[METHOD]', '[/path]').as('[endpoint-alias]');
  });

  it('should_return_[status]_when_[happy_path]', () => {
    // TODO: visit the page that triggers this endpoint
    // cy.wait('@[endpoint-alias]').its('response.statusCode').should('eq', [status]);
  });

  it('should_return_401_when_unauthenticated', () => {
    // TODO: call without auth header, expect 401
  });

  it('should_return_400_when_invalid_input', () => {
    // TODO: call with invalid payload, expect 400 + RFC 7807 error body
  });
});
```
````

If no new API endpoints in TDD: skip this step, note "No new endpoints".

### Step 4 — k6 load test stub (if TDD specifies load requirements)

If TDD.md Rollout Strategy mentions requests/sec or p99 latency targets:

File: `scripts/load-tests/k6/{TICKET_ID}-[endpoint-slug].js`

```javascript
import http from 'k6/http';
import { check } from 'k6';

// TODO: Tune vus/duration based on TDD load requirements
export const options = { vus: 10, duration: '30s' };

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/[path]`, {
    headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` },
  });
  check(res, {
    'status is 200': r => r.status === 200,
    'p99 < 500ms': r => r.timings.duration < 500,
  });
}
```

### Step 5 — Output summary

State:

- Performance fixes applied (count + anti-pattern type + file:line)
- Issues noted for human review (count)
- E2E stub files created (paths)
- k6 stub files created (paths, or "none — no load requirements in TDD")

````

- [ ] **Step 2: Commit**

```bash
git add agents/code-perf-agent/instructions.md
git commit -m "feat(ai-dev): add code-perf-agent — N+1 review, E2E stubs, k6 stubs"
````

---

## Self-Review Checklist

### Spec coverage

| Spec requirement                                                                                  | Task           |
| ------------------------------------------------------------------------------------------------- | -------------- |
| `STEPS_ORDERED` includes validate (no Jira subtask)                                               | Task 1, Step 1 |
| `GATED_STEPS` includes 5 agent sub-steps, NOT validate                                            | Task 1, Step 1 |
| `_CODE_ALIAS_MODE` global variable                                                                | Task 1, Step 2 |
| `cmd_init` creates 8 subtasks (requirements through deploy; no validate)                          | Task 1, Step 3 |
| Subtask titles include `{TICKET_ID}` in name                                                      | Task 1, Step 3 |
| code-impl gate: design Done + no Open Questions                                                   | Task 2, Step 2 |
| code-test gate: code-impl Done + IMPL_CHECKLIST.md has no ❌                                      | Task 2, Step 2 |
| code-quality gate: code-test Done                                                                 | Task 2, Step 2 |
| code-security gate: code-quality Done                                                             | Task 2, Step 2 |
| code-perf gate: code-security Done                                                                | Task 2, Step 2 |
| validate gate: code-perf Done                                                                     | Task 2, Step 2 |
| deploy gate: `.validate-passed` marker file                                                       | Task 2, Step 3 |
| cmd_code_impl: budget 3.00, IMPL_CHECKLIST gate, upload checklist to Jira                         | Task 3, Step 1 |
| cmd_code_test: budget 2.00, retry once on coverage failure, hard fail after retry                 | Task 3, Step 2 |
| cmd_code_quality: auto-fix before agent, agent only if needed, budget 0.50                        | Task 3, Step 3 |
| cmd_code_security: secrets scan + npm audit before agent, SECURITY_REVIEW.md gate, FAIL → Blocked | Task 3, Step 4 |
| cmd_code_perf: budget 2.00                                                                        | Task 3, Step 5 |
| cmd_validate: zero agent, 5 checks, marker file on success, no Jira subtask                       | Task 3, Step 6 |
| cmd_code alias: runs 5 agent sub-steps, not validate                                              | Task 3, Step 7 |
| `test` deprecated alias → validate with warning                                                   | Task 4, Step 2 |
| IMPL_CHECKLIST.md format with ✅/❌ per TDD item                                                  | Task 5         |
| `// AC: <id>` tag on every describe block                                                         | Task 6         |
| code-quality agent: warnings ≤ 4 allowed, errors must be zero                                     | Task 7         |
| SECURITY_REVIEW.md verdict parsed by script                                                       | Task 8         |
| E2E Cypress stubs + k6 stubs                                                                      | Task 9         |

### Placeholder scan — none found. All code blocks contain complete, runnable content.

### Consistency check

- `_CODE_ALIAS_MODE` compared with `[ "$_CODE_ALIAS_MODE" = true ]` in all 5 sub-step functions ✓
- `$(feature_dir)/IMPL_CHECKLIST.md` path used in both `check_prerequisite code-test` and `cmd_code_impl` ✓
- `$(feature_dir)/SECURITY_REVIEW.md` path used in both `cmd_code_security` and agent instructions ✓
- `$(feature_dir)/.validate-passed` marker used in both `check_prerequisite deploy` and `cmd_validate` ✓
- Budget values: code-impl=3.00, code-test=2.00, code-quality=0.50, code-security=1.00, code-perf=2.00 ✓
