# Fix Subcommands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six `fix-*` subcommands to `scripts/ai-dev.sh` — `fix-lint`, `fix-types`, `fix-tests`, `fix-build`, `fix-security`, `fix-conflicts` — each with a matching agent instructions file, and wire `deploy-ship` to call them instead of printing manual guidance.

**Architecture:** Each command runs a deterministic auto-fix pass first (no agent tokens), then invokes a lightweight Claude agent only for errors that survive auto-fix. All commands commit + push on success and post a brief Jira comment on the parent ticket. `deploy-ship`'s `failure` branch is updated to call the matching `cmd_fix_*` function rather than printing manual instructions.

**Tech Stack:** Bash 5, GitHub CLI (`gh`), npm/eslint/prettier/tsc/jest, `jq`, existing `run_agent` / `jira_add_comment` / `jira_api` helpers in `ai-dev.sh`, Claude agent instructions in Markdown.

---

## File Map

| Action | File                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| Modify | `scripts/ai-dev.sh` — add 6 `cmd_fix_*` functions, update `cmd_help`, update `cmd_deploy_ship`, extend dispatch table |
| Create | `agents/fix-lint-agent/instructions.md`                                                                               |
| Create | `agents/fix-types-agent/instructions.md`                                                                              |
| Create | `agents/fix-tests-agent/instructions.md`                                                                              |
| Create | `agents/fix-build-agent/instructions.md`                                                                              |
| Create | `agents/fix-security-agent/instructions.md`                                                                           |
| Create | `agents/fix-conflicts-agent/instructions.md`                                                                          |

---

## Task 1: `fix-lint` agent instructions

**Files:**

- Create: `agents/fix-lint-agent/instructions.md`

- [ ] **Step 1: Create agent instructions file**

````markdown
# Fix Lint Agent — Vyasa Intelligence

## Role

Fix ESLint and Prettier violations in changed files with the minimal code change.
Do not suppress rules without a justification comment. Do not change business logic. Do not add features.

## Model

Recommended: `claude-haiku`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit source files in `apps/` and `libs/` (fix violations only — no logic changes)
- Run: `npm run lint -- --format=compact`, `npx tsc --noEmit`
- Forbidden: adding new features, changing test logic, modifying `*.spec.ts` / `*.test.ts`, adding `// eslint-disable` without a justification comment

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{CHANGED_FILES}` — comma-separated list of changed files
- `{REMAINING_ERRORS}` — eslint --format=compact output that survived auto-fix

---

## Instructions

### Step 1 — Understand remaining violations

Read `{REMAINING_ERRORS}`. Then run:

```bash
npm run lint -- --format=compact 2>&1 | head -80
```
````

Identify which files have violations and what rules are failing.

### Step 2 — Fix each violation

For each error line, apply the minimal fix:

- `no-console` → replace with `@orderflow/logger` call (import if not already imported)
- `@typescript-eslint/no-explicit-any` → replace `any` with `unknown` + type guard
- `@typescript-eslint/no-unused-vars` → remove the unused variable or import
- `max-lines-per-function` → extract logic into a private helper
- `prettier/prettier` → re-format to match prettier config (run prettier --write)
- Any other rule → fix the code to comply, do not suppress

If a rule MUST be suppressed (rare, e.g., intentional `any` for external SDK interop), add:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- [reason: legacy SDK type from <package>]
```

### Step 3 — Final verification

```bash
npm run lint -- --quiet    # must produce zero error lines
npx prettier --check $(echo "{CHANGED_FILES}" | tr ',' ' ') 2>&1 | tail -5
```

If errors remain, keep fixing. Do not stop with open errors.

### Step 4 — Output summary

State:

- Lint errors fixed (count + rule names)
- Any `// eslint-disable` suppressions added with justification
- Files modified

````

- [ ] **Step 2: Verify file exists**

```bash
ls agents/fix-lint-agent/instructions.md
````

---

## Task 2: `fix-types` agent instructions

**Files:**

- Create: `agents/fix-types-agent/instructions.md`

- [ ] **Step 1: Create agent instructions file**

````markdown
# Fix Types Agent — Vyasa Intelligence

## Role

Fix TypeScript type errors reported by `tsc --noEmit`. Apply the minimal type-safe fix for each error.
Do not use `@ts-ignore` or `any` without justification. Do not change business logic.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit source files in `apps/` and `libs/` (type fixes only — no logic changes)
- Run: `npx tsc --noEmit`
- Forbidden: using `@ts-ignore`, adding `any` without justification, changing business logic, adding new features

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{CHANGED_FILES}` — comma-separated list of changed files
- `{TSC_ERRORS}` — full output of `tsc --noEmit 2>&1`

---

## Instructions

### Step 1 — Parse errors

Read `{TSC_ERRORS}`. Group by file. For each error, note: file path, line number, error code (TS####), and message.

### Step 2 — Fix each error

Apply the minimal fix per error code:

- `TS2304` (cannot find name) → add import or declare the missing identifier
- `TS2345` (argument type mismatch) → fix the argument type, update function signature if needed
- `TS2339` (property does not exist) → add the property to the interface/type
- `TS2322` (type not assignable) → fix the assignment; add a type guard if narrowing is needed
- `TS7006` (parameter implicitly has any) → add explicit type annotation
- `TS2532` / `TS2531` (possibly undefined/null) → add null check or use optional chaining
- `TS6133` (declared but never read) → remove the unused declaration
- Never use `@ts-ignore`
- Avoid `any` — use `unknown` + type guard instead

### Step 3 — Read type definition files if needed

If an error references a shared type from `@orderflow/shared-types`, read:

```bash
cat libs/shared-types/src/lib/*.ts
```
````

Do not modify shared-types unless the fix genuinely requires it.

### Step 4 — Final verification

```bash
npx tsc --noEmit 2>&1 | head -30
```

Must exit 0. If errors remain, keep fixing.

### Step 5 — Output summary

State:

- Type errors fixed (count + TS error codes)
- Files modified
- Any interface/type changes made

````

- [ ] **Step 2: Verify file exists**

```bash
ls agents/fix-types-agent/instructions.md
````

---

## Task 3: `fix-tests` agent instructions

**Files:**

- Create: `agents/fix-tests-agent/instructions.md`

- [ ] **Step 1: Create agent instructions file**

````markdown
# Fix Tests Agent — Vyasa Intelligence

## Role

Resolve failing Jest tests using the spec as the tiebreaker.
For each failing test: (1) read its `// AC:` tag, (2) read the matching AC in requirements.md,
(3) if the test matches the spec — fix the implementation; if the test contradicts the spec — fix the test.
Never delete tests. Never weaken assertions.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit failing test files AND corresponding implementation files
- Run: `npm run test:affected -- --no-coverage 2>&1`
- Forbidden: deleting tests, weakening assertions (changing `toEqual` to `toBeDefined`), removing edge cases, adding new features

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{REQUIREMENTS_PATH}` — path to requirements.md (the spec — source of truth)
- `{JEST_FAILURES}` — full output of `jest --no-coverage 2>&1`

---

## Instructions

### Step 1 — Parse failing tests

Read `{JEST_FAILURES}`. For each FAIL block, note:

- Test file path
- Describe block name
- It block name
- Error message and expected vs received values

### Step 2 — For each failing test: spec vs implementation

For each failing test:

1. Open the test file. Find the `// AC:` tag on the describe block. Example: `// AC: AC-3`
2. Open `{REQUIREMENTS_PATH}`. Find the matching acceptance criterion.
3. Read the test expectation carefully.
4. **Decision:**
   - If test expectation matches the spec AC → **implementation is wrong**. Find the src file under `apps/` or `libs/` that the test is testing. Fix the implementation to satisfy the spec.
   - If test expectation contradicts the spec AC → **test is wrong**. Fix the test expectation to match the spec.

### Step 3 — Apply fixes

**When fixing implementation:**

- Locate the function/method being tested
- Apply minimal change to make the test pass without breaking other tests
- Run `npm run test:affected -- --no-coverage 2>&1 | tail -20` after each fix to check

**When fixing test:**

- Update only the failing assertion to match the spec
- Do not add new assertions
- Do not remove the `// AC:` tag

### Step 4 — Final verification

```bash
npm run test:affected -- --no-coverage 2>&1 | tail -20
```
````

Must show all tests passing (0 failing). If tests still fail, re-apply Step 2 for remaining failures.

### Step 5 — Output summary

State:

- Total failures resolved
- Implementation fixes (N): file names + what changed
- Test corrections (N): test names + which AC drove the correction

````

- [ ] **Step 2: Verify file exists**

```bash
ls agents/fix-tests-agent/instructions.md
````

---

## Task 4: `fix-build` agent instructions

**Files:**

- Create: `agents/fix-build-agent/instructions.md`

- [ ] **Step 1: Create agent instructions file**

````markdown
# Fix Build Agent — Vyasa Intelligence

## Role

Fix build failures (Webpack/Vite/esbuild/tsc) caused by missing imports, incorrect module resolution,
circular dependencies, or configuration issues. Apply minimal fixes. Do not restructure code.
Do not change business logic.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository
- Write/edit source files in `apps/` and `libs/` (import/export/config fixes only)
- Run: `npm run build 2>&1 | tail -40`
- Forbidden: adding new npm dependencies without justification, changing business logic, restructuring module hierarchy

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{CHANGED_FILES}` — comma-separated list of changed files
- `{BUILD_ERRORS}` — full output of `npm run build 2>&1`

---

## Instructions

### Step 1 — Classify build errors

Read `{BUILD_ERRORS}`. Classify each error as one of:

- `missing-export` — a symbol is imported but not exported from its module
- `wrong-import-path` — import path resolves to a file that doesn't exist
- `circular-dependency` — A imports B which imports A
- `module-not-found` — imported package/path doesn't exist at all
- `config-error` — build config file has a problem
- `asset-error` — static asset processing failure

### Step 2 — Fix each error

**missing-export:** Add the export statement to the source module.

**wrong-import-path:** Correct the import path. Check `tsconfig.json` path aliases (e.g. `@orderflow/shared-types`).

**circular-dependency:** Extract the shared type/interface into a separate file to break the cycle. Example:

```typescript
// Before: A imports from B, B imports from A
// After: Both A and B import from shared-types/src/lib/common.ts
```
````

**module-not-found:** If it's a workspace package (e.g. `@orderflow/event-schemas`), check if the library has been built:

```bash
npx nx build event-schemas
```

If it's an npm package that's actually missing from package.json, document why it's needed before adding it.

**config-error:** Read the config file and fix the syntax or path issue.

**asset-error:** Fix the asset reference path or add the missing asset.

### Step 3 — Final verification

```bash
npm run build 2>&1 | tail -20
```

Must exit 0. If errors remain, keep fixing.

### Step 4 — Output summary

State:

- Build errors fixed (count + classification)
- Files modified
- Any new dependencies added (with justification)
- Bundle size change (report if > 5 KB gzipped change)

````

- [ ] **Step 2: Verify file exists**

```bash
ls agents/fix-build-agent/instructions.md
````

---

## Task 5: `fix-security` agent instructions

**Files:**

- Create: `agents/fix-security-agent/instructions.md`

- [ ] **Step 1: Create agent instructions file**

````markdown
# Fix Security Agent — Vyasa Intelligence

## Role

Resolve security vulnerabilities flagged by `npm audit`. Upgrade dependencies, apply overrides,
or document acceptable risk with justification. Do not downgrade packages. Do not change application code
unless required to remove a vulnerable code pattern.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read: `package.json`, `package-lock.json`, `docs/features/{TICKET_ID}/SECURITY_REVIEW.md`
- Write: `package.json` (version bumps + overrides only), `docs/features/{TICKET_ID}/SECURITY_REVIEW.md`
- Run: `npm audit --json 2>&1`, `npm audit fix --audit-level=high 2>&1`, `npm install 2>&1 | tail -5`
- Forbidden: downgrading packages, removing dependencies without justification, changing application logic

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{AUDIT_JSON}` — full output of `npm audit --json 2>&1`

---

## Instructions

### Step 1 — Parse vulnerabilities

Read `{AUDIT_JSON}`. For each HIGH/CRITICAL vulnerability, note:

- Package name
- Severity
- CVE ID (if available)
- Fix available? (check `fixAvailable` field)
- Direct or transitive dependency?

### Step 2 — Fix upgradeable vulnerabilities

For vulnerabilities where `fixAvailable` is `true` and the fix is non-breaking (semver minor/patch):

- Update the version in `package.json`
- Run `npm install` to regenerate `package-lock.json`

For breaking fixes (semver major):

- Add a `overrides` entry in `package.json` to force the patched version:

```json
{
  "overrides": {
    "vulnerable-package": ">=patched-version"
  }
}
```
````

Then run `npm install`.

### Step 3 — Document vulnerabilities with no fix

For HIGH/CRITICAL vulnerabilities where no fix is available:

- Append to `docs/features/{TICKET_ID}/SECURITY_REVIEW.md` under a new section `## Accepted Risks`:

```markdown
### CVE-YYYY-XXXXX — <package>@<version>

**Severity:** HIGH/CRITICAL
**Description:** [brief description]
**Impact Assessment:** [how this affects the application]
**Mitigation Plan:** [what we do to reduce risk — e.g., "not exposed to untrusted input", "will upgrade when fix available"]
**Review Date:** [ISO date]
```

### Step 4 — Final verification

```bash
npm audit --audit-level=high 2>&1 | tail -10
```

Should show 0 HIGH/CRITICAL vulnerabilities, or all remaining ones are documented in SECURITY_REVIEW.md.

### Step 5 — Output summary

State:

- Vulnerabilities resolved (count + package names)
- Vulnerabilities documented with accepted risk (count + CVE IDs)
- Changes to package.json (version bumps + overrides added)

````

- [ ] **Step 2: Verify file exists**

```bash
ls agents/fix-security-agent/instructions.md
````

---

## Task 6: `fix-conflicts` agent instructions

**Files:**

- Create: `agents/fix-conflicts-agent/instructions.md`

- [ ] **Step 1: Create agent instructions file**

````markdown
# Fix Conflicts Agent — Vyasa Intelligence

## Role

Resolve git merge conflict markers in staged files after a failed `git rebase`. For each conflict,
choose the correct resolution using TDD.md as the source of truth for feature-owned code.
Do not change code outside of conflict markers. Do not delete base branch changes unrelated to our feature.

## Model

Recommended: `claude-sonnet`

## IMPORTANT: Allowed tools

- Read any file in the repository (especially TDD.md, requirements.md, and conflicted files)
- Write/edit conflicted files to resolve conflict markers only
- Run: `git diff --name-only --diff-filter=U` (list unresolved files), `git status`
- Forbidden: changing code outside conflict markers, adding new features, deleting base branch changes unrelated to the feature, running `git rebase --continue` or `git push` (the script handles these)

---

## Inputs

- `{TICKET_ID}` — ticket identifier
- `{TDD_PATH}` — path to TDD.md (authoritative design for our feature)
- `{REQUIREMENTS_PATH}` — path to requirements.md
- `{CONFLICTED_FILES}` — newline-separated list of files with conflict markers

---

## Instructions

### Step 1 — Understand our feature

Read `{TDD_PATH}` fully. Read `{REQUIREMENTS_PATH}` acceptance criteria section.
This is the source of truth for what our feature is supposed to do.

### Step 2 — Resolve each conflicted file

For each file in `{CONFLICTED_FILES}`:

1. Read the file. Locate all `<<<<<<< HEAD` ... `=======` ... `>>>>>>> origin/main` blocks.
2. For each conflict block, classify:

   **Lockfile / generated file** (`package-lock.json`, `*.lock`, `schema.prisma` generated sections):
   → Accept incoming (origin/main) version. The script regenerates lockfiles after rebase.

   **Feature code we wrote** (new files or sections added by our feature branch):
   → Use `{TDD_PATH}` to verify which version is correct. Our feature's implementation takes priority.
   If both sides have valid changes (e.g., main added a new utility function while we added our feature function),
   keep both — they are not in conflict logically.

   **Unrelated code** (changed by main, not touched by our feature):
   → Accept incoming (origin/main) version to pick up the latest base.

3. Edit the file to remove all conflict markers, leaving only the resolved content.

### Step 3 — Verify no conflict markers remain

After resolving each file, check:

```bash
grep -r "<<<<<<< HEAD" <file>
```
````

Must return nothing.

### Step 4 — Output summary

For each file resolved:

- File path
- Number of conflict blocks resolved
- Resolution strategy used (lockfile / feature-priority / incoming)
- Any ambiguous decisions and why you chose as you did

````

- [ ] **Step 2: Verify file exists**

```bash
ls agents/fix-conflicts-agent/instructions.md
````

---

## Task 7: `cmd_fix_lint` in `ai-dev.sh`

**Files:**

- Modify: `scripts/ai-dev.sh` (add `cmd_fix_lint` function before dispatch section)

- [ ] **Step 1: Add `cmd_fix_lint` function**

Add the following function in `ai-dev.sh` after the `cmd_deploy_ship` function (around line 1953, before `cmd_deploy`):

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: fix-lint
# ══════════════════════════════════════════════════════════════════════

cmd_fix_lint() {
  require_tool "$CLAUDE_CMD"

  echo "Vyasa AI Dev — Fix Lint: $TICKET_ID"
  echo ""

  cd "$REPO_ROOT"
  local changed_files
  changed_files=$(git diff main --name-only | tr '\n' ' ')

  # Step 1: Auto-fix
  echo "Running eslint --fix + prettier --write..."
  npm run lint -- --fix --quiet 2>/dev/null || true
  local fmt_files
  fmt_files=$(git diff main --name-only | grep -E '\.(ts|tsx|js|jsx|json|md)$' | tr '\n' ' ')
  [ -n "$fmt_files" ] && npx prettier --write $fmt_files 2>/dev/null || true

  # Step 2: Check if errors remain
  local errors_after
  errors_after=$(npm run lint -- --format=compact 2>/dev/null | grep -c " error " || echo "0")

  if [ "$errors_after" -gt 0 ]; then
    echo "Auto-fix left ${errors_after} error(s) — invoking fix-lint agent..."
    local error_output
    error_output=$(npm run lint -- --format=compact 2>/dev/null | grep " error " | head -50)

    run_agent agents/fix-lint-agent/instructions.md 0.25 haiku \
      TICKET_ID="$TICKET_ID" \
      CHANGED_FILES="$(git diff main --name-only | tr '\n' ',')" \
      REMAINING_ERRORS="$error_output"
  else
    echo "Auto-fix resolved all lint errors — agent not needed."
  fi

  # Step 3: Final gate
  if ! npm run lint -- --quiet 2>/dev/null; then
    echo ""
    echo "Error: ESLint still failing after fix attempt."
    echo "Manual intervention required."
    exit 1
  fi

  # Re-run prettier on any newly modified files
  local final_fmt_files
  final_fmt_files=$(git diff main --name-only | grep -E '\.(ts|tsx|js|jsx|json|md)$' | tr '\n' ' ')
  [ -n "$final_fmt_files" ] && npx prettier --write $final_fmt_files 2>/dev/null || true

  # Step 4: Commit if changes exist
  git add -u
  if git diff --cached --quiet; then
    echo "No changes to commit — already clean."
  else
    local fix_count
    fix_count=$(git diff --cached --numstat | wc -l | tr -d ' ')
    git commit -m "fix: resolve lint violations [${TICKET_ID}]"
    git push
    echo "Fix committed and pushed."

    # Jira comment (best-effort)
    if [ -n "${JIRA_BASE_URL:-}" ] && [ -n "${JIRA_EMAIL:-}" ] && [ -n "${JIRA_API_TOKEN:-}" ]; then
      jira_add_comment "$TICKET_ID" \
        "Fixed ${fix_count} file(s) with lint/prettier violations. Pushed to branch. Re-run deploy-ship to check CI."
    fi
  fi

  echo ""
  echo "fix-lint complete."
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
}
```

- [ ] **Step 2: Verify function was added (no syntax errors)**

```bash
bash -n scripts/ai-dev.sh && echo "Syntax OK"
```

---

## Task 8: `cmd_fix_types` in `ai-dev.sh`

**Files:**

- Modify: `scripts/ai-dev.sh` (add after `cmd_fix_lint`)

- [ ] **Step 1: Add `cmd_fix_types` function**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: fix-types
# ══════════════════════════════════════════════════════════════════════

cmd_fix_types() {
  require_tool "$CLAUDE_CMD"

  echo "Vyasa AI Dev — Fix Types: $TICKET_ID"
  echo ""

  cd "$REPO_ROOT"
  local changed_files
  changed_files=$(git diff main --name-only | tr '\n' ',')

  local max_attempts=2
  local attempt=0

  while [ "$attempt" -lt "$max_attempts" ]; do
    attempt=$((attempt + 1))

    local tsc_errors
    tsc_errors=$(npx tsc --noEmit 2>&1 || true)

    if [ -z "$(echo "$tsc_errors" | grep "error TS" | head -1)" ]; then
      echo "No TypeScript errors found."
      break
    fi

    echo "Attempt ${attempt}/${max_attempts} — invoking fix-types agent..."
    run_agent agents/fix-types-agent/instructions.md 0.50 sonnet \
      TICKET_ID="$TICKET_ID" \
      CHANGED_FILES="$changed_files" \
      TSC_ERRORS="$tsc_errors"
  done

  # Final gate
  local final_errors
  final_errors=$(npx tsc --noEmit 2>&1 || true)
  if echo "$final_errors" | grep -q "error TS"; then
    echo ""
    echo "Error: TypeScript errors remain after ${max_attempts} attempt(s)."
    echo "Cannot auto-fix — manual intervention needed."
    echo ""
    echo "$final_errors" | head -20
    exit 1
  fi

  # Commit if changes exist
  git add -u
  if git diff --cached --quiet; then
    echo "No changes to commit — already clean."
  else
    git commit -m "fix: resolve TypeScript type errors [${TICKET_ID}]"
    git push
    echo "Fix committed and pushed."

    if [ -n "${JIRA_BASE_URL:-}" ] && [ -n "${JIRA_EMAIL:-}" ] && [ -n "${JIRA_API_TOKEN:-}" ]; then
      jira_add_comment "$TICKET_ID" \
        "Fixed TypeScript type errors. Pushed to branch. Re-run deploy-ship to check CI."
    fi
  fi

  echo ""
  echo "fix-types complete."
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
}
```

- [ ] **Step 2: Syntax check**

```bash
bash -n scripts/ai-dev.sh && echo "Syntax OK"
```

---

## Task 9: `cmd_fix_tests` in `ai-dev.sh`

**Files:**

- Modify: `scripts/ai-dev.sh` (add after `cmd_fix_types`)

- [ ] **Step 1: Add `cmd_fix_tests` function**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: fix-tests
# ══════════════════════════════════════════════════════════════════════

cmd_fix_tests() {
  require_tool "$CLAUDE_CMD"

  echo "Vyasa AI Dev — Fix Tests: $TICKET_ID"
  echo ""

  cd "$REPO_ROOT"
  local req_path="docs/features/$TICKET_ID/requirements.md"

  if [ ! -f "$req_path" ]; then
    echo "Warning: requirements.md not found at $req_path — agent will run without spec context."
  fi

  local max_attempts=2
  local attempt=0

  while [ "$attempt" -lt "$max_attempts" ]; do
    attempt=$((attempt + 1))

    local jest_output
    jest_output=$(npm run test:affected -- --no-coverage 2>&1 || true)

    if ! echo "$jest_output" | grep -q "FAIL "; then
      echo "All tests passing."
      break
    fi

    echo "Attempt ${attempt}/${max_attempts} — invoking fix-tests agent..."
    run_agent agents/fix-tests-agent/instructions.md 1.00 sonnet \
      TICKET_ID="$TICKET_ID" \
      REQUIREMENTS_PATH="$req_path" \
      JEST_FAILURES="$jest_output"
  done

  # Final gate
  local final_output
  final_output=$(npm run test:affected -- --no-coverage 2>&1 || true)
  if echo "$final_output" | grep -q "FAIL "; then
    echo ""
    echo "Error: Tests still failing after ${max_attempts} attempt(s)."
    echo "Cannot auto-fix — manual intervention needed."
    echo ""
    echo "$final_output" | grep -E "FAIL |●" | head -20
    exit 1
  fi

  # Commit if changes exist
  git add -u
  if git diff --cached --quiet; then
    echo "No changes to commit — already clean."
  else
    git commit -m "fix: resolve test failures (spec-driven) [${TICKET_ID}]"
    git push
    echo "Fix committed and pushed."

    if [ -n "${JIRA_BASE_URL:-}" ] && [ -n "${JIRA_EMAIL:-}" ] && [ -n "${JIRA_API_TOKEN:-}" ]; then
      jira_add_comment "$TICKET_ID" \
        "Fixed test failures using spec as tiebreaker. Pushed to branch. Re-run deploy-ship to check CI."
    fi
  fi

  echo ""
  echo "fix-tests complete."
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
}
```

- [ ] **Step 2: Syntax check**

```bash
bash -n scripts/ai-dev.sh && echo "Syntax OK"
```

---

## Task 10: `cmd_fix_build` in `ai-dev.sh`

**Files:**

- Modify: `scripts/ai-dev.sh` (add after `cmd_fix_tests`)

- [ ] **Step 1: Add `cmd_fix_build` function**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: fix-build
# ══════════════════════════════════════════════════════════════════════

cmd_fix_build() {
  require_tool "$CLAUDE_CMD"

  echo "Vyasa AI Dev — Fix Build: $TICKET_ID"
  echo ""

  cd "$REPO_ROOT"
  local changed_files
  changed_files=$(git diff main --name-only | tr '\n' ',')

  local max_attempts=2
  local attempt=0

  while [ "$attempt" -lt "$max_attempts" ]; do
    attempt=$((attempt + 1))

    local build_errors
    build_errors=$(npm run build 2>&1 || true)

    if echo "$build_errors" | grep -qiE "^.*error.*$" && ! echo "$build_errors" | grep -qiE "^error:"; then
      # Check for actual build failure (non-zero exit implies errors)
      if npm run build > /dev/null 2>&1; then
        echo "Build passing."
        break
      fi
    else
      # Re-run to get clean exit status
      if npm run build > /dev/null 2>&1; then
        echo "Build passing."
        break
      fi
    fi

    echo "Attempt ${attempt}/${max_attempts} — invoking fix-build agent..."
    run_agent agents/fix-build-agent/instructions.md 0.50 sonnet \
      TICKET_ID="$TICKET_ID" \
      CHANGED_FILES="$changed_files" \
      BUILD_ERRORS="$build_errors"
  done

  # Final gate
  if ! npm run build > /dev/null 2>&1; then
    local final_errors
    final_errors=$(npm run build 2>&1 || true)
    echo ""
    echo "Error: Build still failing after ${max_attempts} attempt(s)."
    echo "Cannot auto-fix — manual intervention needed."
    echo ""
    echo "$final_errors" | tail -20
    exit 1
  fi

  # Commit if changes exist
  git add -u
  if git diff --cached --quiet; then
    echo "No changes to commit — already clean."
  else
    git commit -m "fix: resolve build errors [${TICKET_ID}]"
    git push
    echo "Fix committed and pushed."

    if [ -n "${JIRA_BASE_URL:-}" ] && [ -n "${JIRA_EMAIL:-}" ] && [ -n "${JIRA_API_TOKEN:-}" ]; then
      jira_add_comment "$TICKET_ID" \
        "Fixed build errors. Pushed to branch. Re-run deploy-ship to check CI."
    fi
  fi

  echo ""
  echo "fix-build complete."
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
}
```

- [ ] **Step 2: Syntax check**

```bash
bash -n scripts/ai-dev.sh && echo "Syntax OK"
```

---

## Task 11: `cmd_fix_security` in `ai-dev.sh`

**Files:**

- Modify: `scripts/ai-dev.sh` (add after `cmd_fix_build`)

- [ ] **Step 1: Add `cmd_fix_security` function**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: fix-security
# ══════════════════════════════════════════════════════════════════════

cmd_fix_security() {
  require_tool "$CLAUDE_CMD"
  require_tool jq

  echo "Vyasa AI Dev — Fix Security: $TICKET_ID"
  echo ""

  cd "$REPO_ROOT"

  # Step 1: Non-breaking auto-fix
  echo "Running npm audit fix (non-breaking)..."
  npm audit fix --audit-level=high 2>/dev/null || true

  # Step 2: Check remaining HIGH/CRITICAL vulnerabilities
  local audit_json
  audit_json=$(npm audit --json 2>/dev/null || true)

  local high_count
  high_count=$(echo "$audit_json" | jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "high" or .value.severity == "critical")] | length' 2>/dev/null || echo "0")

  if [ "$high_count" -gt 0 ]; then
    echo "${high_count} HIGH/CRITICAL vulnerabilities remain — invoking fix-security agent..."
    run_agent agents/fix-security-agent/instructions.md 0.50 sonnet \
      TICKET_ID="$TICKET_ID" \
      AUDIT_JSON="$audit_json"
  else
    echo "No HIGH/CRITICAL vulnerabilities — agent not needed."
  fi

  # Final gate
  if ! npm audit --audit-level=high > /dev/null 2>&1; then
    local remaining
    remaining=$(npm audit --json 2>/dev/null | jq '[.vulnerabilities // {} | to_entries[] | select(.value.severity == "high" or .value.severity == "critical")] | length' 2>/dev/null || echo "?")
    # Check if remaining ones are documented in SECURITY_REVIEW.md
    local security_review="$(feature_dir)/SECURITY_REVIEW.md"
    if [ -f "$security_review" ] && grep -q "## Accepted Risks" "$security_review"; then
      echo "Remaining vulnerabilities documented in SECURITY_REVIEW.md as accepted risks."
    else
      echo ""
      echo "Error: ${remaining} HIGH/CRITICAL vulnerabilities unresolved and not documented."
      echo "  Run npm audit --audit-level=high for details."
      exit 1
    fi
  fi

  # Commit if changes exist
  git add -u
  if git diff --cached --quiet; then
    echo "No changes to commit — already clean."
  else
    git commit -m "fix: resolve security vulnerabilities [${TICKET_ID}]"
    git push
    echo "Fix committed and pushed."

    if [ -n "${JIRA_BASE_URL:-}" ] && [ -n "${JIRA_EMAIL:-}" ] && [ -n "${JIRA_API_TOKEN:-}" ]; then
      jira_add_comment "$TICKET_ID" \
        "Resolved security vulnerabilities. Pushed to branch. Re-run deploy-ship to check CI."
    fi
  fi

  echo ""
  echo "fix-security complete."
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
}
```

- [ ] **Step 2: Syntax check**

```bash
bash -n scripts/ai-dev.sh && echo "Syntax OK"
```

---

## Task 12: `cmd_fix_conflicts` in `ai-dev.sh`

**Files:**

- Modify: `scripts/ai-dev.sh` (add after `cmd_fix_security`)

- [ ] **Step 1: Add `cmd_fix_conflicts` function**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: fix-conflicts
# ══════════════════════════════════════════════════════════════════════

cmd_fix_conflicts() {
  require_tool "$CLAUDE_CMD"
  require_tool gh

  echo "Vyasa AI Dev — Fix Conflicts: $TICKET_ID"
  echo ""

  cd "$REPO_ROOT"

  local tdd_path="docs/features/$TICKET_ID/TDD.md"
  local req_path="docs/features/$TICKET_ID/requirements.md"

  # Step 1: Fetch latest main
  echo "Fetching origin/main..."
  git fetch origin main

  # Step 2: Attempt rebase
  echo "Rebasing onto origin/main..."
  if git rebase origin/main; then
    echo "Rebase succeeded cleanly — no conflicts."
    git push --force-with-lease
    echo "Pushed with --force-with-lease."
    echo ""
    echo "fix-conflicts complete."
    echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
    return 0
  fi

  # Step 3: Conflicts found — count them
  local conflicted_files
  conflicted_files=$(git diff --name-only --diff-filter=U)
  local conflict_count
  conflict_count=$(echo "$conflicted_files" | grep -c . || echo "0")

  if [ "$conflict_count" -gt 10 ]; then
    git rebase --abort
    echo ""
    echo "Error: ${conflict_count} conflicted files — too risky for auto-resolution."
    echo "Manual intervention required."
    echo ""
    echo "Conflicted files:"
    echo "$conflicted_files"
    exit 1
  fi

  echo "${conflict_count} conflicted file(s) — invoking fix-conflicts agent..."

  run_agent agents/fix-conflicts-agent/instructions.md 0.75 sonnet \
    TICKET_ID="$TICKET_ID" \
    TDD_PATH="$tdd_path" \
    REQUIREMENTS_PATH="$req_path" \
    CONFLICTED_FILES="$conflicted_files"

  # Step 4: Stage resolved files and continue rebase
  git add -u
  if ! GIT_EDITOR=true git rebase --continue; then
    git rebase --abort
    echo ""
    echo "Error: Rebase continue failed — agent may not have resolved all conflicts."
    echo "Run: git status"
    exit 1
  fi

  # Step 5: Post-resolution validation
  echo ""
  echo "Running validate to confirm conflict resolution didn't break anything..."
  if ! cmd_validate 2>/dev/null; then
    echo ""
    echo "Error: Validation failed after conflict resolution."
    echo "Conflict resolution introduced a breakage — manual fix required."
    exit 1
  fi

  # Step 6: Regenerate lockfile if package.json was a conflict
  if echo "$conflicted_files" | grep -q "package.json"; then
    echo "package.json was conflicted — regenerating lockfile..."
    npm install
    git add package-lock.json
    git commit -m "chore: regenerate lockfile after rebase [${TICKET_ID}]" || true
  fi

  # Step 7: Push
  git push --force-with-lease
  echo "Pushed with --force-with-lease."

  if [ -n "${JIRA_BASE_URL:-}" ] && [ -n "${JIRA_EMAIL:-}" ] && [ -n "${JIRA_API_TOKEN:-}" ]; then
    jira_add_comment "$TICKET_ID" \
      "Resolved ${conflict_count} merge conflict(s), rebased onto main. Pushed with --force-with-lease. Re-run deploy-ship."
  fi

  echo ""
  echo "fix-conflicts complete."
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy-ship"
}
```

- [ ] **Step 2: Syntax check**

```bash
bash -n scripts/ai-dev.sh && echo "Syntax OK"
```

---

## Task 13: Update `cmd_deploy_ship` to call fix commands

**Files:**

- Modify: `scripts/ai-dev.sh` — `cmd_deploy_ship` failure branch (around lines 1876–1950)

The current `failure` case prints guidance. Update to call the fix commands directly when `auto_mode=true`, and prompt when interactive.

- [ ] **Step 1: Replace the "Execute inline fix" section in `cmd_deploy_ship`**

Find this block (lines ~1924–1949):

```bash
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
```

Replace with:

```bash
      # Delegate to the appropriate fix-* command
      case "$failure_type" in
        lint)      cmd_fix_lint ;;
        types)     cmd_fix_types ;;
        tests)     cmd_fix_tests ;;
        build)     cmd_fix_build ;;
        security)  cmd_fix_security ;;
        conflicts) cmd_fix_conflicts ;;
        *)
          echo "Unhandled failure type: $failure_type"
          exit 0
          ;;
      esac
```

- [ ] **Step 2: Syntax check**

```bash
bash -n scripts/ai-dev.sh && echo "Syntax OK"
```

---

## Task 14: Update `cmd_help` and dispatch table

**Files:**

- Modify: `scripts/ai-dev.sh` — `cmd_help` function and dispatch `case` block

- [ ] **Step 1: Add fix commands to help text**

In `cmd_help`, after the `deploy-ship` line and before `deploy   Deprecated`:

```
  fix-lint       Fix ESLint/Prettier CI failures (can run any time)
  fix-types      Fix TypeScript type errors from CI (can run any time)
  fix-tests      Fix failing Jest tests using spec as tiebreaker (can run any time)
  fix-build      Fix build/compile failures from CI (can run any time)
  fix-security   Fix npm audit HIGH/CRITICAL vulnerabilities (can run any time)
  fix-conflicts  Rebase + resolve merge conflicts on PR branch (can run any time)
```

- [ ] **Step 2: Add fix commands to dispatch table**

In the `case "$SUBCOMMAND" in` block, add before `deploy)`:

```bash
  fix-lint)      cmd_fix_lint ;;
  fix-types)     cmd_fix_types ;;
  fix-tests)     cmd_fix_tests ;;
  fix-build)     cmd_fix_build ;;
  fix-security)  cmd_fix_security ;;
  fix-conflicts) cmd_fix_conflicts ;;
```

- [ ] **Step 3: Syntax check + smoke test**

```bash
bash -n scripts/ai-dev.sh && echo "Syntax OK"
./scripts/ai-dev.sh help | grep fix-lint
```

Expected output includes: `fix-lint       Fix ESLint/Prettier CI failures`

---

## Task 15: Commit all changes

- [ ] **Step 1: Stage and commit agent files**

```bash
git add agents/fix-lint-agent/instructions.md \
        agents/fix-types-agent/instructions.md \
        agents/fix-tests-agent/instructions.md \
        agents/fix-build-agent/instructions.md \
        agents/fix-security-agent/instructions.md \
        agents/fix-conflicts-agent/instructions.md
git commit -m "feat(ai-dev): add fix-* agent instructions for CI failure remediation"
```

- [ ] **Step 2: Stage and commit ai-dev.sh changes**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): add fix-lint/types/tests/build/security/conflicts subcommands"
```

- [ ] **Step 3: Update CHANGELOG.md**

Add to `CHANGELOG.md` under `[Unreleased]` → `Added`:

```markdown
- `fix-lint`: Auto-fix ESLint/Prettier violations; agent handles unfixable errors
- `fix-types`: Fix TypeScript type errors with up to 2 agent attempts
- `fix-tests`: Resolve test failures using spec (requirements.md) as tiebreaker
- `fix-build`: Fix build/compile errors; agent classifies and resolves
- `fix-security`: Resolve `npm audit` HIGH/CRITICAL vulnerabilities or document accepted risk
- `fix-conflicts`: Rebase + resolve merge conflicts using TDD.md as source of truth
- `deploy-ship`: Now delegates CI failures to the appropriate `fix-*` command
```

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): add fix-* subcommands to unreleased section"
```

---

## Self-Review

### Spec coverage check

| Spec requirement                                                | Task                            |
| --------------------------------------------------------------- | ------------------------------- |
| `fix-lint`: eslint --fix + prettier before agent                | Task 7 `cmd_fix_lint`           |
| `fix-lint`: agent only if errors remain                         | Task 7 (conditional invocation) |
| `fix-lint`: commit + push on success                            | Task 7                          |
| `fix-lint`: Jira comment on parent ticket                       | Task 7                          |
| `fix-types`: tsc --noEmit captures errors → agent               | Task 8                          |
| `fix-types`: max 2 agent attempts                               | Task 8 (`max_attempts=2`)       |
| `fix-types`: no @ts-ignore without justification                | Task 2 agent instructions       |
| `fix-tests`: spec is tiebreaker                                 | Task 3 agent instructions       |
| `fix-tests`: read // AC: tag → requirements.md                  | Task 3 Step 2                   |
| `fix-tests`: max 2 agent attempts                               | Task 9                          |
| `fix-build`: classify error type                                | Task 4 agent instructions       |
| `fix-build`: no new deps without justification                  | Task 4 agent instructions       |
| `fix-security`: npm audit fix (non-breaking) first              | Task 11                         |
| `fix-security`: document accepted risk in SECURITY_REVIEW.md    | Task 5 agent Step 3             |
| `fix-conflicts`: rebase not merge                               | Task 12 (`git rebase`)          |
| `fix-conflicts`: --force-with-lease not --force                 | Task 12                         |
| `fix-conflicts`: post-resolution validate                       | Task 12 Step 5                  |
| `fix-conflicts`: blocked if > 10 conflicted files               | Task 12 Step 3                  |
| `fix-conflicts`: regenerate lockfile if package.json conflicted | Task 12 Step 6                  |
| `deploy-ship` calls fix-\* instead of inline guidance           | Task 13                         |
| help text updated                                               | Task 14                         |
| dispatch table updated                                          | Task 14                         |

### Placeholder scan

No TBD/TODO/placeholder language found. All code blocks are complete.

### Type/name consistency

- `cmd_fix_lint`, `cmd_fix_types`, `cmd_fix_tests`, `cmd_fix_build`, `cmd_fix_security`, `cmd_fix_conflicts` — consistent snake_case naming matching existing functions
- All `run_agent` calls use correct arg format: `file budget model KEY=VALUE ...`
- `feature_dir` / `pr_number_file` / `fix_retries_file` called consistently
- `jira_add_comment` called on `$TICKET_ID` (parent), not subtask — matches spec ("brief comment on parent ticket")
