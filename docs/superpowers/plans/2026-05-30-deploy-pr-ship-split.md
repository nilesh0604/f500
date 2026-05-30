# deploy-pr / deploy-ship Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current `deploy` step in `scripts/ai-dev.sh` into `deploy-pr` (push branch + open PR) and `deploy-ship` (monitor CI, classify failures, dispatch fixes with retry guard).

**Architecture:** All changes are in `scripts/ai-dev.sh`. `deploy-pr` re-uses the existing `deploy-agent` (no agent changes needed), stores the PR number in `$(feature_dir)/.pr_number`, and transitions the Jira subtask to "In Review". `deploy-ship` reads that PR number, calls `gh pr checks`, classifies failures into one of six typed buckets, prompts user confirmation (or skips with `--auto`), executes inline fixes where deterministic (lint), prints guided commands for the rest, and guards against infinite loops via a `$(feature_dir)/.fix_retries.json` counter capped at 3 per type.

**Tech Stack:** Bash 5, `gh` CLI (GitHub CLI), `jq`, existing Jira REST helpers.

---

### Task 1: Update pipeline constants and `cmd_init()` subtask arrays

**Files:**

- Modify: `scripts/ai-dev.sh:21-22` — STEPS_ORDERED, GATED_STEPS
- Modify: `scripts/ai-dev.sh:727-747` — init step arrays

- [ ] **Step 1: Replace STEPS_ORDERED and GATED_STEPS (lines 21–22)**

```bash
STEPS_ORDERED=(requirements design code-impl code-test code-quality code-security code-perf validate deploy-pr deploy-ship)
GATED_STEPS=(requirements design code-impl code-test code-quality code-security code-perf deploy-pr)
```

- [ ] **Step 2: Replace the three step arrays in `cmd_init()` (lines 727–747)**

```bash
  local step_names=("requirements" "design" "code-impl" "code-test" "code-quality" "code-security" "code-perf" "deploy-pr" "deploy-ship")
  local step_summaries=(
    "[AI] Requirements Analysis"
    "[AI] Technical Design"
    "[AI] Implementation: ${TICKET_ID}"
    "[AI] Spec Tests: ${TICKET_ID}"
    "[AI] Code Quality: ${TICKET_ID}"
    "[AI] Security Review: ${TICKET_ID}"
    "[AI] Performance Review: ${TICKET_ID}"
    "[AI] PR: ${TICKET_ID}"
    "[AI] Ship: ${TICKET_ID}"
  )
  local step_descriptions=(
    "AI-generated requirements analysis. Review and transition to Done to approve."
    "AI-generated technical design document (TDD). Review and transition to Done to approve."
    "AI-generated spec-driven implementation. Reviews IMPL_CHECKLIST.md and transitions to Done when approved."
    "AI-generated spec compliance tests verifying all acceptance criteria. Review coverage report and transition to Done."
    "AI-enforced lint, TypeScript, and formatting. Transitions to Done when all checks pass."
    "AI-generated OWASP review. Produces SECURITY_REVIEW.md. Transition to Done when verdict is acceptable."
    "AI-generated performance review and E2E stubs. Transition to Done when approved."
    "AI-generated PR: pushes branch, opens PR with filled template. Transitions to In Review when PR created."
    "CI monitoring: checks PR status, classifies failures, dispatches fixes. Transitions to Done when CI is green."
  )
```

- [ ] **Step 3: Verify syntax**

```bash
bash -n scripts/ai-dev.sh
```

Expected: no output (no syntax errors)

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "refactor(ai-dev): split deploy into deploy-pr and deploy-ship pipeline steps"
```

---

### Task 2: Add file-path helpers and new `check_prerequisite` cases

**Files:**

- Modify: `scripts/ai-dev.sh` — after `subtasks_file()` (line 42), inside `check_prerequisite()` (before closing `esac` at line 462)

- [ ] **Step 1: Add two helper functions immediately after `subtasks_file()` (line 42)**

```bash
pr_number_file() {
  echo "$(feature_dir)/.pr_number"
}

fix_retries_file() {
  echo "$(feature_dir)/.fix_retries.json"
}
```

- [ ] **Step 2: Add `deploy-pr` and `deploy-ship` prerequisite cases**

Inside `check_prerequisite()`, replace the closing `esac` (after the `deploy)` block at line 461) with:

```bash
    deploy-pr)
      local validate_marker
      validate_marker="$(feature_dir)/.validate-passed"
      if [ ! -f "$validate_marker" ]; then
        echo "Error: Validation has not passed for $TICKET_ID."
        echo "  Run: ./scripts/ai-dev.sh $TICKET_ID validate"
        exit 1
      fi
      ;;
    deploy-ship)
      local pr_file
      pr_file="$(pr_number_file)"
      if [ ! -f "$pr_file" ]; then
        echo "Error: No PR found for $TICKET_ID. Run deploy-pr first."
        echo "  Run: ./scripts/ai-dev.sh $TICKET_ID deploy-pr"
        exit 1
      fi
      ;;
  esac
```

- [ ] **Step 3: Add `gh` install hint to `require_tool()`**

Inside the `case "$tool" in` block inside `require_tool()`, add:

```bash
      gh)             echo "  Install: brew install gh (macOS) or https://cli.github.com" ;;
```

- [ ] **Step 4: Verify syntax**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): add pr_number_file/fix_retries_file helpers and deploy-pr/deploy-ship prerequisites"
```

---

### Task 3: Add `get_ci_status()` and `classify_ci_failure()` helpers

**Files:**

- Modify: `scripts/ai-dev.sh` — new section inserted before `cmd_deploy` (around line 1620)

- [ ] **Step 1: Insert CI helper section before the `cmd_deploy` block**

```bash
# ══════════════════════════════════════════════════════════════════════
# CI Status Helpers (used by deploy-ship)
# ══════════════════════════════════════════════════════════════════════

# get_ci_status <pr_number>
# Returns: "success" | "failure" | "pending"
get_ci_status() {
  local pr_number="$1"
  local checks_output
  checks_output=$(gh pr checks "$pr_number" 2>&1) || true

  if echo "$checks_output" | grep -qiE $'^\S[^\t]*\t+fail'; then
    echo "failure"
  elif echo "$checks_output" | grep -qiE $'^\S[^\t]*\t+(pending|in_progress|queued)'; then
    echo "pending"
  else
    echo "success"
  fi
}

# classify_ci_failure <pr_number>
# Returns: "lint" | "types" | "tests" | "build" | "security" | "conflicts" | "unknown"
classify_ci_failure() {
  local pr_number="$1"
  local failed_checks
  failed_checks=$(gh pr checks "$pr_number" 2>&1 \
    | grep -iE $'\t+fail' \
    | awk '{print tolower($1)}')

  if echo "$failed_checks" | grep -qiE 'lint|eslint|format|prettier'; then
    echo "lint"
  elif echo "$failed_checks" | grep -qiE 'typescript|tsc|type-check|typecheck'; then
    echo "types"
  elif echo "$failed_checks" | grep -qiE 'test|jest|spec|coverage'; then
    echo "tests"
  elif echo "$failed_checks" | grep -qiE 'build|compile|bundle'; then
    echo "build"
  elif echo "$failed_checks" | grep -qiE 'security|audit|snyk|scan|sast|llm-security'; then
    echo "security"
  elif gh pr view "$pr_number" --json mergeable --jq '.mergeable' 2>/dev/null \
       | grep -q "CONFLICTING"; then
    echo "conflicts"
  else
    echo "unknown"
  fi
}
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): add get_ci_status and classify_ci_failure helpers"
```

---

### Task 4: Implement `cmd_deploy_pr()`

**Files:**

- Modify: `scripts/ai-dev.sh` — new function after the CI helpers, before `cmd_deploy`

- [ ] **Step 1: Insert `cmd_deploy_pr()` function**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: deploy-pr
# ══════════════════════════════════════════════════════════════════════

cmd_deploy_pr() {
  require_tool "$CLAUDE_CMD"
  require_tool gh
  require_jira_creds
  check_prerequisite deploy-pr

  local subtask_key
  subtask_key=$(get_subtask_key "deploy-pr")

  echo "Vyasa AI Dev — Deploy PR: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  # If PR already exists for this branch, skip creation
  local existing_pr existing_url
  existing_pr=$(gh pr view --json number --jq '.number' 2>/dev/null || true)
  if [ -n "$existing_pr" ]; then
    existing_url=$(gh pr view --json url --jq '.url' 2>/dev/null)
    echo "PR already exists: $existing_url"
    echo "  PR #${existing_pr} — skipping duplicate creation."
    echo ""
    echo "Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
    return 0
  fi

  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  cd "$REPO_ROOT"
  local branch changed_files
  branch=$(git branch --show-current)
  changed_files=$(git diff main --name-only | tr '\n' ',')

  run_agent agents/deploy-agent/instructions.md 0.50 haiku \
    TICKET_ID="$TICKET_ID" \
    BRANCH="$branch" \
    CHANGED_FILES="$changed_files"

  # Gate: PR must now exist
  local pr_number pr_url
  pr_number=$(gh pr view --json number --jq '.number' 2>/dev/null || true)
  if [ -z "$pr_number" ]; then
    jira_add_comment "$subtask_key" "Deploy agent failed to open a PR. Re-run needed."
    echo "Error: PR was not created by the agent. Re-run this step."
    exit 1
  fi

  pr_url=$(gh pr view "$pr_number" --json url --jq '.url' 2>/dev/null)

  # Persist PR number for deploy-ship
  echo "$pr_number" > "$(pr_number_file)"

  # Gate: CI must be triggered (checks appear within ~10 s)
  sleep 10
  local ci_status
  ci_status=$(get_ci_status "$pr_number")

  local comment_body
  comment_body="AI Pipeline — PR Opened

Ticket: $TICKET_ID
Branch: $branch
PR: $pr_url (#${pr_number})
CI initial status: ${ci_status}

---
Review the PR. When you are satisfied:
  ./scripts/ai-dev.sh $TICKET_ID deploy-ship"

  jira_add_comment "$subtask_key" "$comment_body"
  jira_add_comment "$TICKET_ID" \
    "PR opened: $pr_url\n\nRun deploy-ship to monitor CI and fix failures automatically."

  jira_transition_to "$subtask_key" "In Review" 2>/dev/null || true

  echo ""
  echo "PR opened: $pr_url"
  echo "  PR #${pr_number}"
  echo "  CI status: ${ci_status}"
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  echo ""
  echo "Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
}
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): implement deploy-pr subcommand"
```

---

### Task 5: Implement `cmd_deploy_ship()`

**Files:**

- Modify: `scripts/ai-dev.sh` — new function immediately after `cmd_deploy_pr()`

- [ ] **Step 1: Insert `cmd_deploy_ship()` function**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: deploy-ship
# ══════════════════════════════════════════════════════════════════════

cmd_deploy_ship() {
  require_tool gh
  require_tool jq
  require_jira_creds
  check_prerequisite deploy-ship

  local auto_mode=false
  [ "${EXTRA_ARG:-}" = "--auto" ] && auto_mode=true

  local pr_number
  pr_number=$(cat "$(pr_number_file)")

  local subtask_key
  subtask_key=$(get_subtask_key "deploy-ship")

  echo "Vyasa AI Dev — Deploy Ship: $TICKET_ID"
  echo "  PR #${pr_number}"
  echo ""

  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  local ci_status
  ci_status=$(get_ci_status "$pr_number")

  case "$ci_status" in
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
      jira_add_comment "$subtask_key" \
        "✅ CI all-green. PR #${pr_number} ready to merge.\n\nMerge: gh pr merge ${pr_number} --squash --delete-branch"
      jira_transition_to "$subtask_key" "Done" 2>/dev/null || true
      ;;

    pending)
      echo "⏳ CI checks still running. Re-run when complete:"
      echo "  ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
      ;;

    failure)
      local failure_type
      failure_type=$(classify_ci_failure "$pr_number")

      # Initialise retry tracking if missing
      local retries_file
      retries_file="$(fix_retries_file)"
      if [ ! -f "$retries_file" ]; then
        echo '{"lint":0,"types":0,"tests":0,"build":0,"security":0,"conflicts":0}' > "$retries_file"
      fi

      local retry_count
      retry_count=$(jq -r ".[\"$failure_type\"] // 0" "$retries_file" 2>/dev/null || echo "0")

      if [ "$retry_count" -ge 3 ]; then
        echo "❌ Hard block: max retries (3) reached for '$failure_type' failures."
        echo "   Manual intervention required."
        echo ""
        gh pr checks "$pr_number" 2>/dev/null || true
        jira_add_comment "$subtask_key" \
          "❌ Hard block: max retries (3) reached for ${failure_type}. Manual fix required before re-running deploy-ship."
        jira_transition_to "$subtask_key" "Blocked" 2>/dev/null || true
        exit 1
      fi

      echo "❌ CI failed — type: $failure_type (attempt $((retry_count + 1))/3)"
      echo ""
      gh pr checks "$pr_number" 2>/dev/null || true
      echo ""

      if [ "$failure_type" = "unknown" ]; then
        echo "Unknown failure — fetching raw logs..."
        local run_id
        run_id=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
        [ -n "$run_id" ] && gh run view "$run_id" --log-failed 2>/dev/null | head -80 || true
        echo ""
        echo "Manual intervention required. Fix and push, then re-run:"
        echo "  ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
        jira_add_comment "$subtask_key" \
          "❌ CI failed with unclassifiable error. Manual fix required. See GitHub Actions logs."
        jira_transition_to "$subtask_key" "Blocked" 2>/dev/null || true
        exit 1
      fi

      # Map failure type to description and fix guidance
      local fix_desc fix_cmd
      case "$failure_type" in
        lint)
          fix_desc="ESLint / Prettier failures"
          fix_cmd="auto-fix with eslint --fix + prettier"
          ;;
        types)
          fix_desc="TypeScript type errors"
          fix_cmd="npx tsc --noEmit  # review errors, fix, then: git add -u && git commit -m 'fix(types): ...' && git push"
          ;;
        tests)
          fix_desc="Jest test failures"
          fix_cmd="npm run test:affected  # review failures, fix, then: git add -u && git commit -m 'fix(tests): ...' && git push"
          ;;
        build)
          fix_desc="Build / compile errors"
          fix_cmd="npm run build  # review errors, fix, then: git add -u && git commit -m 'fix(build): ...' && git push"
          ;;
        security)
          fix_desc="Security scan findings"
          fix_cmd="./scripts/ai-dev.sh $TICKET_ID code-security"
          ;;
        conflicts)
          fix_desc="Merge conflicts with main"
          fix_cmd="git fetch origin && git merge origin/main  # resolve conflicts, git push"
          ;;
      esac

      echo "Suggested fix for $fix_desc:"
      echo "  $fix_cmd"
      echo ""

      if [ "$auto_mode" = false ]; then
        printf "Apply fix now? (y/N): "
        read -r confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
          echo "Skipped. Fix manually, push, then re-run:"
          echo "  ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
          exit 0
        fi
      fi

      # Increment retry count before attempting fix
      local new_count=$((retry_count + 1))
      local updated_json
      updated_json=$(jq ".[\"$failure_type\"] = $new_count" "$retries_file")
      echo "$updated_json" > "$retries_file"

      # Execute inline fix for deterministic cases; print guidance for the rest
      case "$failure_type" in
        lint)
          cd "$REPO_ROOT"
          npm run lint -- --fix --quiet 2>/dev/null || true
          local fmt_files
          fmt_files=$(git diff main --name-only | grep -E '\.(ts|tsx|js|jsx|json|md)$' | tr '\n' ' ')
          [ -n "$fmt_files" ] && npx prettier --write $fmt_files 2>/dev/null || true
          git add -u
          if git diff --cached --quiet; then
            echo "No changes to commit after auto-fix — lint may need manual attention."
          else
            git commit -m "fix(lint): auto-fix lint and format errors [${TICKET_ID}]"
            git push
            echo ""
            echo "Fix pushed. CI re-running."
          fi
          echo "  Run: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
          ;;
        *)
          echo "Fix requires manual changes. After fixing:"
          echo "  git add -u && git commit -m 'fix(${failure_type}): ...' && git push"
          echo "  ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
          exit 0
          ;;
      esac
      ;;
  esac
}
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n scripts/ai-dev.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): implement deploy-ship with CI monitoring, failure classification, and retry guard"
```

---

### Task 6: Update dispatch table, help text, and deprecate `cmd_deploy()`

**Files:**

- Modify: `scripts/ai-dev.sh` — `cmd_help()`, `cmd_deploy()`, dispatch `case` block

- [ ] **Step 1: Update `cmd_help()` — subcommands list**

Replace:

```
  deploy           Open PR (needs: validate passed)
```

With:

```
  deploy-pr        Push branch + open PR (needs: validate passed)
  deploy-ship      Monitor CI; classify + fix failures (needs: deploy-pr done)
  deploy           Deprecated — use deploy-pr then deploy-ship
```

- [ ] **Step 2: Update `cmd_help()` — Workflow section**

Replace:

```
  6. ./scripts/ai-dev.sh OF-456 deploy
```

With:

```
  6a. ./scripts/ai-dev.sh OF-456 deploy-pr     (push branch, open PR)
  6b. ./scripts/ai-dev.sh OF-456 deploy-ship   (monitor CI; re-run until green or hard-blocked)
```

- [ ] **Step 3: Add deprecation notice to `cmd_deploy()`**

Insert at the very start of `cmd_deploy()` (first line inside the function body):

```bash
  echo "Warning: 'deploy' is deprecated — use 'deploy-pr' then 'deploy-ship'."
  echo ""
```

- [ ] **Step 4: Add dispatch cases for the two new subcommands**

In the `case "$SUBCOMMAND" in` block, add immediately before the existing `deploy)` line:

```bash
  deploy-pr)     cmd_deploy_pr ;;
  deploy-ship)   cmd_deploy_ship ;;
```

- [ ] **Step 5: Verify syntax and smoke-test help**

```bash
bash -n scripts/ai-dev.sh && ./scripts/ai-dev.sh 2>/dev/null | grep -E 'deploy'
```

Expected output contains lines for `deploy-pr`, `deploy-ship`, and `deploy   Deprecated`.

- [ ] **Step 6: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire deploy-pr/deploy-ship dispatch and deprecate deploy"
```

---

## Self-Review

### Spec coverage

| Requirement                                                   | Covered                                           |
| ------------------------------------------------------------- | ------------------------------------------------- |
| deploy-pr: validate passed prerequisite                       | ✅ Task 2                                         |
| deploy-pr: PR already exists → print URL, no duplicate        | ✅ Task 4                                         |
| deploy-pr: store PR number for deploy-ship                    | ✅ Task 4 (pr_number_file)                        |
| deploy-pr: post PR URL to parent Jira ticket                  | ✅ Task 4                                         |
| deploy-pr: Jira subtask → "In Review"                         | ✅ Task 4                                         |
| deploy-pr: gate — PR created (201)                            | ✅ Task 4 (pr_number check)                       |
| deploy-pr: gate — CI triggered                                | ✅ Task 4 (sleep 10 + get_ci_status check logged) |
| deploy-ship: classify failure into 6 types                    | ✅ Task 3 (classify_ci_failure)                   |
| deploy-ship: user confirmation before fix                     | ✅ Task 5                                         |
| deploy-ship: --auto flag skips confirmation                   | ✅ Task 5 (EXTRA_ARG check)                       |
| deploy-ship: max 3 retries per failure type                   | ✅ Task 5 (fix_retries.json)                      |
| deploy-ship: unknown failure → surface logs, block            | ✅ Task 5                                         |
| deploy-ship: all-green → print merge command, no auto-merge   | ✅ Task 5                                         |
| deploy-ship: Jira → "Done" on success, "Blocked" on hard fail | ✅ Task 5                                         |
| init creates deploy-pr + deploy-ship subtasks                 | ✅ Task 1                                         |
| Jira subtask title `[AI] PR: {TICKET_ID}`                     | ✅ Task 1                                         |
| `deploy` deprecated with clear message                        | ✅ Task 6                                         |

### Placeholder scan

No TBD, TODO, or "implement later" found. All code blocks are complete.

### Type/name consistency

- `pr_number_file()` — defined Task 2, used Tasks 4 & 5 ✅
- `fix_retries_file()` — defined Task 2, used Task 5 ✅
- `get_ci_status()` — defined Task 3, used Tasks 4 & 5 ✅
- `classify_ci_failure()` — defined Task 3, used Task 5 ✅
- `cmd_deploy_pr()` — defined Task 4, dispatched Task 6 ✅
- `cmd_deploy_ship()` — defined Task 5, dispatched Task 6 ✅
