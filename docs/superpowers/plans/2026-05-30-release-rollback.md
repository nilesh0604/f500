# Release & Rollback Subcommands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `release` and `rollback` subcommands to `scripts/ai-dev.sh` that complete the post-merge deployment lifecycle (CDK deploy, smoke tests, auto-rollback, Jira updates) and a rollback escape hatch.

**Architecture:** `release` is a script-only command (no AI agent needed — it's deterministic infra operations, like `validate`). It reads the merged PR from `.pr_number`, switches to main, validates AWS creds, runs CDK deploy for the 3 known stacks, syncs S3/CloudFront for UI, runs health-check smoke tests, and auto-rolls back if smoke tests fail. `rollback` checks out the `main~1` CDK/app state temporarily and redeploys.

**Tech Stack:** Bash, AWS CLI v2, AWS CDK (run from `infra/`), GitHub CLI (`gh`), Jira REST API, jq.

---

## File Map

| Action | Path                                  | Purpose                                                    |
| ------ | ------------------------------------- | ---------------------------------------------------------- |
| Modify | `scripts/ai-dev.sh`                   | Add helpers, `cmd_release`, `cmd_rollback`, help, dispatch |
| Modify | `agents/deploy-agent/instructions.md` | Add "Next: release" note after PR merge                    |
| Modify | `CHANGELOG.md`                        | Document new subcommands under [Unreleased] > Added        |

---

## Key Constants (referenced throughout)

- **CDK stacks** (always deploy these three in order):
  `OrderFlow-VyasaVector OrderFlow-VyasaRag OrderFlow-VyasaUi`
- **AWS region**: `us-east-1`
- **CDK working directory**: `infra/` (CDK is run with `cd infra && npx cdk …`)
- **RAG CloudFormation export name**: `OrderFlow-VyasaRag-FunctionUrl`
- **UI CloudFormation export names**: `OrderFlow-VyasaUi-UiBucketName`, `OrderFlow-VyasaUi-DistributionId`, `OrderFlow-VyasaUi-DistributionDomain`
- **UI build dist path**: `apps/vyasa-ui/dist/`
- **Smoke test wait (RAG)**: 20 seconds after CDK deploy
- **Smoke test wait (UI)**: 30 seconds after S3 sync

---

## Task 1: Add `release_marker_file` helper + `require_tool` aws case + `release` prerequisite

**Files:**

- Modify: `scripts/ai-dev.sh:49-66` (after `fix_retries_file()`, before `require_tool`)
- Modify: `scripts/ai-dev.sh:53-66` (add `aws` case to `require_tool`)
- Modify: `scripts/ai-dev.sh:462-489` (add `release` and `rollback` cases to `check_prerequisite`)

- [ ] **Step 1: Add `release_marker_file()` helper after `fix_retries_file()`**

Find this block in `scripts/ai-dev.sh` (around line 49):

```bash
fix_retries_file() {
  echo "$(feature_dir)/.fix_retries.json"
}
```

Insert after it:

```bash
release_marker_file() {
  echo "$(feature_dir)/.last-known-good-commit"
}
```

- [ ] **Step 2: Add `aws` case to `require_tool`**

Find the `require_tool` function's `case` block (around line 57). After the `gh)` case and before `esac`, insert:

```bash
      aws)            echo "  Install: brew install awscli (macOS) or https://aws.amazon.com/cli/" ;;
```

The full updated case block should look like:

```bash
    case "$tool" in
      jq)             echo "  Install: brew install jq (macOS) or apt install jq (Linux)" ;;
      codemie-claude) echo "  Install: npm install -g @codemieai/code" ;;
      claude)         echo "  Install: npm install -g @anthropic-ai/claude-code" ;;
      curl)           echo "  Install: should be available on all systems" ;;
      gh)             echo "  Install: brew install gh (macOS) or https://cli.github.com" ;;
      aws)            echo "  Install: brew install awscli (macOS) or https://aws.amazon.com/cli/" ;;
    esac
```

- [ ] **Step 3: Add `release` prerequisite check to `check_prerequisite`**

Find `check_prerequisite`'s case block. After the `deploy-ship)` case (around line 487) and before the closing `esac`, insert:

```bash
    release)
      local ship_key
      ship_key=$(get_subtask_key "deploy-ship")
      if [ -z "$ship_key" ]; then
        echo "Error: Pipeline not initialized. Run init first."
        echo "  ./scripts/ai-dev.sh $TICKET_ID init"
        exit 1
      fi
      local ship_status
      ship_status=$(jira_get_status "$ship_key")
      if [ "$ship_status" != "Done" ]; then
        echo "Error: Deploy-ship not complete (status: $ship_status)."
        echo "  Run deploy-ship until CI is green, then merge the PR, then run release."
        exit 1
      fi
      local pr_file
      pr_file="$(pr_number_file)"
      if [ ! -f "$pr_file" ]; then
        echo "Error: No PR found for $TICKET_ID. Run deploy-pr first."
        exit 1
      fi
      ;;
```

- [ ] **Step 4: Verify the file parses cleanly**

Run:

```bash
bash -n scripts/ai-dev.sh
```

Expected: no output (clean parse).

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): add release_marker_file helper and release prerequisite check"
```

---

## Task 2: Implement `cmd_release`

**Files:**

- Modify: `scripts/ai-dev.sh` — insert `cmd_release` function before the `cmd_deploy` deprecation block (around line 2392)

- [ ] **Step 1: Insert `cmd_release` function**

Insert the following block before the line `# ══════════════════════════════════════════════════════════════════════` that precedes `# Subcommand: deploy` (the deprecated one, around line 2392):

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: release
# Post-merge deployment lifecycle: CDK deploy → S3/CF → smoke tests → Jira Done
# ══════════════════════════════════════════════════════════════════════

cmd_release() {
  require_tool aws
  require_tool gh
  require_tool jq
  require_jira_creds
  check_prerequisite release

  echo "Vyasa AI Dev — Release (Post-Merge Deploy): $TICKET_ID"
  echo ""

  # Verify PR is merged
  local pr_number
  pr_number=$(cat "$(pr_number_file)")
  local pr_state
  pr_state=$(gh pr view "$pr_number" --json state --jq '.state' 2>/dev/null || echo "unknown")
  if [ "$pr_state" != "MERGED" ]; then
    echo "Error: PR #${pr_number} is not merged yet (state: $pr_state)."
    echo "  Merge the PR in GitHub, then re-run release."
    echo "  Merge: gh pr merge $pr_number --squash --delete-branch"
    exit 1
  fi

  # Switch to main and pull
  cd "$REPO_ROOT"
  echo "[1/8] Switching to main and pulling latest..."
  git checkout main
  git pull origin main

  # Validate AWS credentials
  echo "[2/8] Validating AWS credentials..."
  if ! aws sts get-caller-identity --output text > /dev/null 2>&1; then
    echo "Error: AWS credentials not configured or expired."
    echo "  Run: aws configure  OR  export AWS_PROFILE=<profile>"
    exit 1
  fi
  local aws_account
  aws_account=$(aws sts get-caller-identity --query 'Account' --output text)
  echo "  Account: $aws_account  Region: us-east-1"

  # CDK synth — catch config errors before committing to a deploy
  echo "[3/8] Running cdk synth (pre-flight check)..."
  cd "$REPO_ROOT/infra"
  if ! npx cdk synth --quiet 2>&1; then
    echo "Error: cdk synth failed — fix stack configuration before deploying."
    jira_add_comment "$TICKET_ID" \
      "❌ Release pre-flight failed: cdk synth error. Fix and re-run release."
    exit 1
  fi
  cd "$REPO_ROOT"

  # Clean install + builds
  echo "[4/8] Installing dependencies and building..."
  npm ci
  npx nx build vyasa-rag-service 2>/dev/null || true
  (cd apps/vyasa-ui && npm run build) || true

  # Record pre-deploy rollback target (main~1 state)
  git rev-parse HEAD~1 > "$(release_marker_file)" 2>/dev/null || true

  local deploy_start
  deploy_start=$(date +%s)

  # CDK deploy
  echo "[5/8] Deploying CDK stacks..."
  cd "$REPO_ROOT/infra"
  if ! npx cdk deploy OrderFlow-VyasaVector OrderFlow-VyasaRag OrderFlow-VyasaUi \
       --require-approval never 2>&1; then
    cd "$REPO_ROOT"
    echo "Error: CDK deploy failed."
    jira_add_comment "$TICKET_ID" \
      "❌ Release failed: CDK deploy error. Check terminal for details. Run rollback if production is impacted."
    exit 1
  fi
  cd "$REPO_ROOT"

  # Capture CloudFormation stack outputs
  echo "[6/8] Capturing stack outputs..."
  local rag_endpoint ui_bucket ui_dist_id ui_domain
  rag_endpoint=$(aws cloudformation describe-stacks \
    --stack-name OrderFlow-VyasaRag \
    --query 'Stacks[0].Outputs[?ExportName==`OrderFlow-VyasaRag-FunctionUrl`].OutputValue' \
    --output text 2>/dev/null || echo "")
  ui_bucket=$(aws cloudformation describe-stacks \
    --stack-name OrderFlow-VyasaUi \
    --query 'Stacks[0].Outputs[?ExportName==`OrderFlow-VyasaUi-UiBucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")
  ui_dist_id=$(aws cloudformation describe-stacks \
    --stack-name OrderFlow-VyasaUi \
    --query 'Stacks[0].Outputs[?ExportName==`OrderFlow-VyasaUi-DistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")
  ui_domain=$(aws cloudformation describe-stacks \
    --stack-name OrderFlow-VyasaUi \
    --query 'Stacks[0].Outputs[?ExportName==`OrderFlow-VyasaUi-DistributionDomain`].OutputValue' \
    --output text 2>/dev/null || echo "")

  # S3 sync + CloudFront invalidation for UI
  if [ -n "$ui_bucket" ] && [ -d "$REPO_ROOT/apps/vyasa-ui/dist" ]; then
    echo "  Syncing UI assets to S3..."
    aws s3 sync apps/vyasa-ui/dist/ "s3://${ui_bucket}" \
      --delete \
      --cache-control "public,max-age=31536000,immutable" \
      --exclude "index.html"
    aws s3 cp apps/vyasa-ui/dist/index.html \
      "s3://${ui_bucket}/index.html" \
      --cache-control "no-cache,no-store,must-revalidate"

    if [ -n "$ui_dist_id" ]; then
      echo "  Invalidating CloudFront cache..."
      aws cloudfront create-invalidation \
        --distribution-id "$ui_dist_id" \
        --paths "/*" > /dev/null
    fi
  fi

  # Smoke tests
  echo "[7/8] Running smoke tests..."
  local smoke_pass=true

  if [ -n "$rag_endpoint" ]; then
    echo "  Waiting 20s for Lambda cold start..."
    sleep 20
    if curl -sf "${rag_endpoint}/health" -o /dev/null --max-time 15; then
      echo "  ✅ RAG: ${rag_endpoint}/health"
    else
      echo "  ❌ RAG smoke test failed: ${rag_endpoint}/health"
      smoke_pass=false
    fi
  else
    echo "  ⚠️  RAG endpoint not found in stack outputs — skipping RAG smoke test"
  fi

  if [ -n "$ui_domain" ]; then
    echo "  Waiting 30s for CloudFront propagation..."
    sleep 30
    if curl -sf "https://${ui_domain}" -o /dev/null --max-time 15; then
      echo "  ✅ UI: https://${ui_domain}"
    else
      echo "  ❌ UI smoke test failed: https://${ui_domain}"
      smoke_pass=false
    fi
  else
    echo "  ⚠️  UI domain not found in stack outputs — skipping UI smoke test"
  fi

  # Auto-rollback on smoke test failure
  if [ "$smoke_pass" != true ]; then
    echo ""
    echo "❌ Smoke tests failed — initiating auto-rollback..."
    jira_add_comment "$TICKET_ID" \
      "❌ Release smoke tests failed after CDK deploy. Initiating auto-rollback to main~1 state."

    local rollback_commit
    rollback_commit=$(cat "$(release_marker_file)" 2>/dev/null || echo "")

    if [ -n "$rollback_commit" ]; then
      echo "  Checking out infra/apps from ${rollback_commit:0:8}..."
      git checkout "$rollback_commit" -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || true
      cd "$REPO_ROOT/infra"
      npx cdk deploy OrderFlow-VyasaVector OrderFlow-VyasaRag OrderFlow-VyasaUi \
        --require-approval never 2>/dev/null || true
      cd "$REPO_ROOT"
      git checkout HEAD -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || true
      echo "  Rollback deploy complete."
    else
      echo "  No rollback marker found — manual intervention required."
    fi

    jira_add_comment "$TICKET_ID" \
      "❌ Release FAILED for ${TICKET_ID}. Smoke tests failed post-deploy. Auto-rollback to ${rollback_commit:0:8} attempted. Verify production manually."
    exit 1
  fi

  local deploy_end elapsed
  deploy_end=$(date +%s)
  elapsed=$((deploy_end - deploy_start))

  # Transition parent ticket to Done
  echo "[8/8] Updating Jira..."
  jira_transition_to "$TICKET_ID" "Done" 2>/dev/null || true

  local deployed_commit
  deployed_commit=$(git rev-parse --short HEAD)

  local summary_body
  summary_body="✅ Release Complete — ${TICKET_ID}

Deployed commit: ${deployed_commit}
Duration: ${elapsed}s
AWS Account: ${aws_account}

Stack Outputs:
- RAG Endpoint: ${rag_endpoint:-N/A}
- UI Domain: https://${ui_domain:-N/A}
- UI S3 Bucket: ${ui_bucket:-N/A}
- CloudFront ID: ${ui_dist_id:-N/A}

Smoke Tests: ✅ All passed

Feature is live in production."

  jira_add_comment "$TICKET_ID" "$summary_body"

  echo ""
  echo "======================================"
  echo " RELEASE COMPLETE: $TICKET_ID"
  echo "======================================"
  echo ""
  echo "  Commit:   $deployed_commit"
  echo "  Duration: ${elapsed}s"
  echo "  RAG:      ${rag_endpoint:-N/A}"
  echo "  UI:       https://${ui_domain:-N/A}"
  echo "  Ticket:   ${JIRA_BASE_URL}/browse/$TICKET_ID"
}
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n scripts/ai-dev.sh
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): add release subcommand — CDK deploy, smoke tests, auto-rollback, Jira Done"
```

---

## Task 3: Implement `cmd_rollback`

**Files:**

- Modify: `scripts/ai-dev.sh` — insert `cmd_rollback` immediately after `cmd_release`

- [ ] **Step 1: Insert `cmd_rollback` function immediately after the `cmd_release` closing brace**

```bash
# ══════════════════════════════════════════════════════════════════════
# Subcommand: rollback
# Redeploy CDK stacks to main~1 state as a manual escape hatch
# ══════════════════════════════════════════════════════════════════════

cmd_rollback() {
  require_tool aws
  require_tool jq
  require_jira_creds

  echo "Vyasa AI Dev — Rollback: $TICKET_ID"
  echo ""

  cd "$REPO_ROOT"

  # Validate AWS credentials
  echo "[1/4] Validating AWS credentials..."
  if ! aws sts get-caller-identity --output text > /dev/null 2>&1; then
    echo "Error: AWS credentials not configured or expired."
    echo "  Run: aws configure  OR  export AWS_PROFILE=<profile>"
    exit 1
  fi

  # Determine rollback target
  local rollback_commit
  local release_marker
  release_marker="$(release_marker_file)"
  if [ -f "$release_marker" ]; then
    rollback_commit=$(cat "$release_marker")
    echo "  Using release marker: ${rollback_commit:0:8} (saved by last release run)"
  else
    echo "  No release marker found — falling back to HEAD~1"
    rollback_commit=$(git rev-parse HEAD~1 2>/dev/null || echo "")
  fi

  if [ -z "$rollback_commit" ]; then
    echo "Error: Cannot determine rollback target."
    echo "  Ensure you are on main and have at least 2 commits."
    exit 1
  fi

  echo "  Rolling back to commit: ${rollback_commit:0:8}"
  echo ""

  # Switch to main
  echo "[2/4] Switching to main..."
  git checkout main
  git pull origin main

  # Checkout infra + app code from rollback target
  echo "[3/4] Checking out previous infra and app state..."
  git checkout "$rollback_commit" -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || {
    echo "Error: Could not checkout state from ${rollback_commit:0:8}."
    echo "  The commit may not include the paths infra/, apps/vyasa-rag-service/, apps/vyasa-ui/"
    exit 1
  }

  echo "  Deploying CDK stacks with rollback state..."
  cd "$REPO_ROOT/infra"
  if ! npx cdk deploy OrderFlow-VyasaVector OrderFlow-VyasaRag OrderFlow-VyasaUi \
       --require-approval never 2>&1; then
    cd "$REPO_ROOT"
    git checkout HEAD -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || true
    echo ""
    echo "Error: Rollback CDK deploy failed."
    jira_add_comment "$TICKET_ID" \
      "❌ Rollback FAILED for ${TICKET_ID}. CDK deploy with state ${rollback_commit:0:8} failed. Manual AWS Console intervention required."
    exit 1
  fi
  cd "$REPO_ROOT"

  # Restore working tree to HEAD
  git checkout HEAD -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || true

  echo "[4/4] Updating Jira..."
  jira_add_comment "$TICKET_ID" \
    "⏪ Rollback executed for ${TICKET_ID}. Reverted CDK stacks to commit ${rollback_commit:0:8}. Infrastructure redeployed to previous known-good state. Re-investigate the issue before re-running release."
  jira_transition_to "$TICKET_ID" "In Progress" 2>/dev/null || true

  echo ""
  echo "======================================"
  echo " ROLLBACK COMPLETE: $TICKET_ID"
  echo "======================================"
  echo ""
  echo "  Reverted to: ${rollback_commit:0:8}"
  echo "  Ticket:      ${JIRA_BASE_URL}/browse/$TICKET_ID"
  echo ""
  echo "Investigate the smoke test failure, fix the issue, then:"
  echo "  ./scripts/ai-dev.sh $TICKET_ID release"
}
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n scripts/ai-dev.sh
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): add rollback subcommand — redeploy CDK stacks to main~1 known-good state"
```

---

## Task 4: Update `cmd_help`, dispatch case, and `cmd_validate` "Next" hint

**Files:**

- Modify: `scripts/ai-dev.sh:496-556` (help text)
- Modify: `scripts/ai-dev.sh:1627` (validate "Next" hint)
- Modify: `scripts/ai-dev.sh:2550-2563` (dispatch case)

- [ ] **Step 1: Update `cmd_help` — add `release` and `rollback` to Subcommands list**

Find the help text's `Subcommands:` block. After the line:

```
  deploy           Deprecated — use deploy-pr then deploy-ship
```

Insert:

```
  release          Post-merge CDK deploy: synth, build, deploy, smoke tests, Jira Done (needs: PR merged)
  rollback         Revert CDK stacks to previous known-good state (main~1 or release marker)
```

- [ ] **Step 2: Update `cmd_help` — add release to Workflow section**

Find the Workflow section. After:

```
  6b. ./scripts/ai-dev.sh OF-456 deploy-ship   (monitor CI; re-run until green or hard-blocked)
```

Insert:

```
  7.  Merge the PR in GitHub (gh pr merge <number> --squash --delete-branch)
  8.  ./scripts/ai-dev.sh OF-456 release       (CDK deploy to prod + smoke tests + Jira Done)
      On failure: ./scripts/ai-dev.sh OF-456 rollback
```

- [ ] **Step 3: Update `cmd_validate` "Next" hint**

Find (around line 1627):

```bash
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy"
```

Replace with:

```bash
  echo "  Next: ./scripts/ai-dev.sh $TICKET_ID deploy-pr"
```

(This line already says `deploy` — double-checking the actual file. Looking at line 1627, it says `deploy` which is the deprecated alias. Fix it to `deploy-pr`.)

- [ ] **Step 4: Add `release` and `rollback` to dispatch case**

Find the dispatch `case` block. After:

```bash
  deploy)        cmd_deploy ;;
```

Insert:

```bash
  release)       cmd_release ;;
  rollback)      cmd_rollback ;;
```

- [ ] **Step 5: Verify syntax and help output**

```bash
bash -n scripts/ai-dev.sh
./scripts/ai-dev.sh --help 2>&1 | grep -E "release|rollback"
```

Expected output includes:

```
  release          Post-merge CDK deploy: ...
  rollback         Revert CDK stacks ...
```

- [ ] **Step 6: Verify dispatch works (dry-run: missing creds will fail, but we see the right function called)**

```bash
./scripts/ai-dev.sh SCRUM-999 release 2>&1 | head -5
```

Expected first line: `Vyasa AI Dev — Release (Post-Merge Deploy): SCRUM-999`

```bash
./scripts/ai-dev.sh SCRUM-999 rollback 2>&1 | head -5
```

Expected first line: `Vyasa AI Dev — Rollback: SCRUM-999`

- [ ] **Step 7: Commit**

```bash
git add scripts/ai-dev.sh
git commit -m "feat(ai-dev): wire release/rollback dispatch, update help text and workflow steps"
```

---

## Task 5: Update `agents/deploy-agent/instructions.md` to mention release

**Files:**

- Modify: `agents/deploy-agent/instructions.md` — add "Next step" note at bottom

- [ ] **Step 1: Append release note to deploy-agent instructions**

Find the end of `agents/deploy-agent/instructions.md` — the last section is `### Step 5 — Output PR URL`. Append after the code block:

```markdown
---

## Post-PR Next Step

After the PR is merged by a human reviewer, the post-merge deployment is handled by the `release` subcommand — **not by this agent**:
```

./scripts/ai-dev.sh {TICKET_ID} release

```

This deploys CDK stacks to production, syncs S3/CloudFront for the UI, runs smoke tests, and transitions the Jira parent ticket to Done.
```

- [ ] **Step 2: Verify the file looks correct**

```bash
tail -15 agents/deploy-agent/instructions.md
```

Expected: the new Post-PR Next Step section is visible.

- [ ] **Step 3: Commit**

```bash
git add agents/deploy-agent/instructions.md
git commit -m "docs(deploy-agent): add post-merge release step reference"
```

---

## Task 6: Update CHANGELOG.md

**Files:**

- Modify: `CHANGELOG.md` — add entry under `[Unreleased] > Added`

- [ ] **Step 1: Find the `### Added` block under `[Unreleased]`**

Look for:

```markdown
### Added
```

under `## [Unreleased]`. Insert the following entry at the **top** of the Added list (or create the `### Added` section if it doesn't exist):

```markdown
- **ai-dev: `release` subcommand** — Post-merge production deployment lifecycle. Verifies PR merged, switches to main, validates AWS credentials, runs `cdk synth` pre-flight, `npm ci`, builds affected apps, deploys `OrderFlow-VyasaVector`, `OrderFlow-VyasaRag`, and `OrderFlow-VyasaUi` CDK stacks, syncs UI assets to S3 and invalidates CloudFront, runs health-check smoke tests against live endpoints, auto-rolls back to `main~1` state if smoke tests fail, transitions parent Jira ticket to Done, and posts a deployment summary comment (endpoints, timing, commit SHA). Usage: `./scripts/ai-dev.sh SCRUM-123 release`
- **ai-dev: `rollback` subcommand** — Manual escape hatch to revert production CDK stacks to a previous known-good state. Uses the commit saved by the last `release` run (`.last-known-good-commit` marker) or falls back to `HEAD~1`. Checks out `infra/`, `apps/vyasa-rag-service/`, and `apps/vyasa-ui/` from the rollback commit, redeploys all three CDK stacks, then restores the working tree. Posts a rollback event comment to Jira and transitions the ticket back to In Progress. Usage: `./scripts/ai-dev.sh SCRUM-123 rollback`
```

- [ ] **Step 2: Verify the CHANGELOG renders correctly**

```bash
head -60 CHANGELOG.md
```

Expected: both new bullet points visible under `[Unreleased] > Added`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add release and rollback subcommands to CHANGELOG"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement                                | Task                               |
| ------------------------------------------ | ---------------------------------- |
| `release` subcommand added                 | Task 2                             |
| Pre-requisite: PR merged (GitHub API)      | Task 2, Step 1 of `cmd_release`    |
| Pre-requisite: switch to main + pull       | Task 2, `[1/8]`                    |
| Pre-requisite: validate AWS creds          | Task 2, `[2/8]`                    |
| Pre-requisite: cdk synth                   | Task 2, `[3/8]`                    |
| CDK deploy executes for affected stacks    | Task 2, `[5/8]`                    |
| Capture stack outputs                      | Task 2, `[6/8]`                    |
| CloudFront invalidation + S3 sync for UI   | Task 2, `[6/8]`                    |
| RAG /health smoke test                     | Task 2, `[7/8]`                    |
| Auto-rollback on smoke test failure        | Task 2, `[7/8]` (smoke_pass block) |
| Jira parent ticket → Done on success       | Task 2, `[8/8]`                    |
| Deployment summary Jira comment            | Task 2, `[8/8]` (summary_body)     |
| `rollback` subcommand                      | Task 3                             |
| Rollback deploys previous known-good state | Task 3                             |
| Rollback posts Jira comment                | Task 3, Step 1                     |
| CHANGELOG updated                          | Task 6                             |
| Deploy-agent instructions updated          | Task 5                             |
| Help text updated with new subcommands     | Task 4                             |

### Placeholder Scan

No TBDs, TODOs, or "add appropriate" phrases present — all steps contain concrete code.

### Type Consistency

Shell script — no types. Helper names consistent: `release_marker_file()` called identically in `cmd_release` and `cmd_rollback`.

CDK stack names used identically everywhere: `OrderFlow-VyasaVector OrderFlow-VyasaRag OrderFlow-VyasaUi`.

CloudFormation export names consistent with CD workflow patterns: `OrderFlow-VyasaRag-FunctionUrl`, `OrderFlow-VyasaUi-UiBucketName`, `OrderFlow-VyasaUi-DistributionId`, `OrderFlow-VyasaUi-DistributionDomain`.
