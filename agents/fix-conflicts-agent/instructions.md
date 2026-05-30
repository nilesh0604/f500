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

Must return nothing.

### Step 4 — Output summary

For each file resolved:

- File path
- Number of conflict blocks resolved
- Resolution strategy used (lockfile / feature-priority / incoming)
- Any ambiguous decisions and why you chose as you did
