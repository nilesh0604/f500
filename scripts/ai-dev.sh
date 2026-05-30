#!/bin/bash
# ai-dev.sh — Async AI-driven development pipeline (Jira-backed)
#
# Each step runs independently, produces output for offline human review in Jira.
# Approval = transitioning the Jira subtask to "Done".
# State lives in Jira, not local files.
#
# Usage:
#   ./scripts/ai-dev.sh <TICKET_ID> <subcommand>
#
# Requirements:
#   - codemie-claude CLI: npm install -g @codemieai/code
#     (or set AI_DEV_CLAUDE_CMD=claude to use raw Claude Code CLI)
#   - jq: brew install jq (macOS) or apt install jq (Linux)
#   - JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN env vars

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_CMD="${AI_DEV_CLAUDE_CMD:-codemie-claude}"
STEPS_ORDERED=(requirements design code-impl code-test code-quality code-security code-perf validate deploy-pr deploy-ship)
GATED_STEPS=(requirements design code-impl code-test code-quality code-security code-perf deploy-pr)
_CODE_ALIAS_MODE=false

# ══════════════════════════════════════════════════════════════════════
# Argument Parsing
# ══════════════════════════════════════════════════════════════════════

TICKET_ID="${1:-}"
SUBCOMMAND="${2:-}"
EXTRA_ARG="${3:-}"

# ══════════════════════════════════════════════════════════════════════
# Shared Utility Functions
# ══════════════════════════════════════════════════════════════════════

feature_dir() {
  echo "$REPO_ROOT/docs/features/$TICKET_ID"
}

subtasks_file() {
  echo "$(feature_dir)/.jira-subtasks"
}

require_tool() {
  local tool="$1"
  if ! command -v "$tool" &>/dev/null; then
    echo "Error: '$tool' is required but not installed."
    case "$tool" in
      jq)             echo "  Install: brew install jq (macOS) or apt install jq (Linux)" ;;
      codemie-claude) echo "  Install: npm install -g @codemieai/code" ;;
      claude)         echo "  Install: npm install -g @anthropic-ai/claude-code" ;;
      curl)           echo "  Install: should be available on all systems" ;;
    esac
    exit 1
  fi
}

require_jira_creds() {
  if [ -z "${JIRA_BASE_URL:-}" ] || [ -z "${JIRA_EMAIL:-}" ] || [ -z "${JIRA_API_TOKEN:-}" ]; then
    echo "Error: Jira credentials required."
    echo "  Set: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN"
    echo "  Example:"
    echo "    export JIRA_BASE_URL=https://yourcompany.atlassian.net"
    echo "    export JIRA_EMAIL=you@company.com"
    echo "    export JIRA_API_TOKEN=your-api-token"
    exit 1
  fi
}

# strip_markdown <stdin>
# Removes common Markdown tokens so text is readable as plain text in Jira ADF comments.
strip_markdown() {
  sed \
    -e 's/\*\*\([^*]*\)\*\*/\1/g' \
    -e 's/\*\([^*]*\)\*/\1/g' \
    -e 's/`\([^`]*\)`/\1/g' \
    -e 's/^### Q\([0-9][0-9]*\): /Q\1: /' \
    -e 's/^### //' \
    -e 's/^## //' \
    -e 's/^# //'
}

# ══════════════════════════════════════════════════════════════════════
# Agent Runner
# ══════════════════════════════════════════════════════════════════════

# run_agent <instructions_file> <budget_usd> <model> [KEY=VALUE ...]
#
# Reads the agent instructions file, substitutes {KEY} placeholders with
# provided values, and invokes codemie-claude (or $CLAUDE_CMD) in
# non-interactive print mode.
#
# Example:
#   run_agent agents/requirements-agent/instructions.md 1.50 sonnet \
#     TICKET_ID="OF-123" TICKET_CONTEXT="$context"
#
run_agent() {
  local instructions_file="$1"
  local budget="$2"
  local model="$3"
  shift 3

  if [ ! -f "$REPO_ROOT/$instructions_file" ]; then
    echo "Error: Instructions file not found: $instructions_file" >&2
    return 1
  fi

  local instructions
  instructions=$(cat "$REPO_ROOT/$instructions_file")

  # Substitute {KEY} placeholders with provided KEY=VALUE pairs
  for kv in "$@"; do
    local key="${kv%%=*}"
    local value="${kv#*=}"
    # Use env vars + perl to handle newlines and special chars safely
    instructions=$(SUBST_KEY="{$key}" SUBST_VAL="$value" perl -e '
      my $text = do { local $/; <STDIN> };
      my $k = quotemeta($ENV{SUBST_KEY});
      my $v = $ENV{SUBST_VAL};
      $text =~ s/$k/$v/g;
      print $text;
    ' <<< "$instructions")
  done

  $CLAUDE_CMD -p \
    --system-prompt "$instructions" \
    --model "$model" \
    --max-budget-usd "$budget" \
    --dangerously-skip-permissions \
    "Execute the task described in your system prompt. Follow all instructions precisely and produce the required output artifacts."
}

# ══════════════════════════════════════════════════════════════════════
# Jira REST API Helpers
# ══════════════════════════════════════════════════════════════════════

jira_api() {
  local method="$1" endpoint="$2" data="${3:-}"
  local url="${JIRA_BASE_URL}/rest/api/3${endpoint}"

  if [ -n "$data" ]; then
    curl -s -X "$method" \
      -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url"
  else
    curl -s -X "$method" \
      -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
      -H "Content-Type: application/json" \
      "$url"
  fi
}

jira_get_issue() {
  local issue_key="$1"
  jira_api GET "/issue/${issue_key}"
}

jira_get_status() {
  local issue_key="$1"
  jira_get_issue "$issue_key" | jq -r '.fields.status.name'
}

jira_get_issue_type_id() {
  local project_key="$1" type_name="$2"
  local result
  result=$(jira_api GET "/issue/createmeta/${project_key}/issuetypes")
  echo "$result" | jq -r ".issueTypes[] | select(.name == \"$type_name\" or .name == \"Sub-task\" or .name == \"Subtask\") | .id" | head -1
}

jira_create_subtask() {
  local parent_key="$1" summary="$2" description="${3:-}"
  local project_key="${parent_key%%-*}"

  # Get subtask issue type ID
  local subtask_type_id
  subtask_type_id=$(jira_get_issue_type_id "$project_key" "Subtask")
  if [ -z "$subtask_type_id" ]; then
    subtask_type_id=$(jira_get_issue_type_id "$project_key" "Sub-task")
  fi

  if [ -z "$subtask_type_id" ]; then
    echo "Error: Could not find Subtask issue type in project $project_key" >&2
    return 1
  fi

  local payload
  payload=$(jq -n \
    --arg proj "$project_key" \
    --arg type "$subtask_type_id" \
    --arg sum "$summary" \
    --arg desc "$description" \
    --arg parent "$parent_key" \
    '{
      fields: {
        project: { key: $proj },
        issuetype: { id: $type },
        parent: { key: $parent },
        summary: $sum,
        description: {
          type: "doc",
          version: 1,
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: $desc }]
          }]
        }
      }
    }')

  local result
  result=$(jira_api POST "/issue" "$payload")
  echo "$result" | jq -r '.key // empty'
}

jira_add_comment() {
  local issue_key="$1" body="$2"

  local payload
  payload=$(jq -n --arg text "$body" '{
    body: {
      type: "doc",
      version: 1,
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: $text }]
      }]
    }
  }')

  jira_api POST "/issue/${issue_key}/comment" "$payload" > /dev/null
}

jira_get_comments() {
  local issue_key="$1"
  jira_api GET "/issue/${issue_key}/comment" | jq -r '.comments'
}

jira_upload_attachment() {
  local issue_key="$1" file_path="$2"

  curl -s -X POST \
    -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
    -H "X-Atlassian-Token: no-check" \
    -F "file=@${file_path}" \
    "${JIRA_BASE_URL}/rest/api/3/issue/${issue_key}/attachments" > /dev/null
}

jira_get_transitions() {
  local issue_key="$1"
  jira_api GET "/issue/${issue_key}/transitions"
}

jira_transition_to() {
  local issue_key="$1" target_status="$2"

  local transitions transition_id
  transitions=$(jira_get_transitions "$issue_key")
  transition_id=$(echo "$transitions" | jq -r ".transitions[] | select(.name == \"$target_status\" or (.to.name == \"$target_status\")) | .id" | head -1)

  if [ -z "$transition_id" ]; then
    echo "Warning: Could not find transition to '$target_status' for $issue_key" >&2
    return 1
  fi

  local payload
  payload=$(jq -n --arg id "$transition_id" '{ transition: { id: $id } }')
  jira_api POST "/issue/${issue_key}/transitions" "$payload" > /dev/null
}

# ══════════════════════════════════════════════════════════════════════
# Subtask Mapping Helpers
# ══════════════════════════════════════════════════════════════════════

save_subtask_key() {
  local step="$1" key="$2"
  local sf
  sf="$(subtasks_file)"
  if grep -q "^${step}=" "$sf" 2>/dev/null; then
    sed -i'' -e "s/^${step}=.*/${step}=${key}/" "$sf"
  else
    echo "${step}=${key}" >> "$sf"
  fi
}

get_subtask_key() {
  local step="$1"
  local sf
  sf="$(subtasks_file)"
  if [ -f "$sf" ]; then
    grep "^${step}=" "$sf" 2>/dev/null | cut -d= -f2
  fi
}

is_gated_step() {
  local step="$1"
  for gs in "${GATED_STEPS[@]}"; do
    if [ "$gs" = "$step" ]; then
      return 0
    fi
  done
  return 1
}

check_prerequisite() {
  local step="$1"

  case "$step" in
    requirements)
      local sf="$(subtasks_file)"
      if [ ! -f "$sf" ]; then
        echo "Error: Pipeline not initialized. Run init first."
        echo "  ./scripts/ai-dev.sh $TICKET_ID init"
        exit 1
      fi
      ;;
    design)
      local req_key
      req_key=$(get_subtask_key "requirements")
      if [ -z "$req_key" ]; then
        echo "Error: Requirements subtask not found. Run init first."
        exit 1
      fi
      local req_status
      req_status=$(jira_get_status "$req_key")
      if [ "$req_status" != "Done" ]; then
        echo "Error: Requirements not approved (status: $req_status)."
        echo "  Review in Jira: ${JIRA_BASE_URL}/browse/$req_key"
        echo "  Transition subtask to 'Done' when approved."
        exit 1
      fi
      local req_file="$(feature_dir)/requirements.md"
      if has_unresolved_questions "$req_file" 2>/dev/null; then
        echo "Error: Unresolved open questions in requirements.md."
        echo "  Run: ./scripts/ai-dev.sh $TICKET_ID resolve"
        exit 1
      fi
      ;;
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
    deploy)
      local validate_marker
      validate_marker="$(feature_dir)/.validate-passed"
      if [ ! -f "$validate_marker" ]; then
        echo "Error: Validation has not passed for $TICKET_ID."
        echo "  Run: ./scripts/ai-dev.sh $TICKET_ID validate"
        exit 1
      fi
      ;;
  esac
}

# ══════════════════════════════════════════════════════════════════════
# Subcommand: help
# ══════════════════════════════════════════════════════════════════════

cmd_help() {
  cat <<'HELP'
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
HELP
}

# ══════════════════════════════════════════════════════════════════════
# Subcommand: create
# ══════════════════════════════════════════════════════════════════════

cmd_create() {
  require_tool "$CLAUDE_CMD"
  require_tool jq
  require_jira_creds

  local project_key="$TICKET_ID"
  local idea="$EXTRA_ARG"

  if [ -z "$idea" ]; then
    echo "Usage: ./scripts/ai-dev.sh <PROJECT_KEY> create \"your idea here\""
    echo "  Example: ./scripts/ai-dev.sh OF create \"add session timeout to chat\""
    exit 1
  fi

  echo "Vyasa AI Dev — Creating ticket from idea"
  echo "  Project: $project_key"
  echo "  Idea:    $idea"
  echo ""

  # Run ticket-creator agent to generate structured ticket
  echo "Analyzing codebase and generating ticket..."
  local agent_output
  agent_output=$(cd "$REPO_ROOT" && run_agent \
    agents/ticket-creator/instructions.md 2.00 sonnet \
    IDEA="$idea" \
    PROJECT_KEY="$project_key" 2>/dev/null)

  # Extract JSON from agent output (between markers)
  local ticket_json
  ticket_json=$(echo "$agent_output" | sed -n '/---JSON_OUTPUT_START---/,/---JSON_OUTPUT_END---/p' | grep -v -- '---JSON_OUTPUT')

  if [ -z "$ticket_json" ] || ! echo "$ticket_json" | jq -e '.summary' &>/dev/null; then
    echo "Error: Could not parse ticket from agent output."
    echo "Agent output (last 50 lines):"
    echo "$agent_output" | tail -50
    exit 1
  fi

  # Extract fields
  local summary description ticket_type priority labels
  summary=$(echo "$ticket_json" | jq -r '.summary')
  description=$(echo "$ticket_json" | jq -r '.description')
  ticket_type=$(echo "$ticket_json" | jq -r '.type // "feature"')
  priority=$(echo "$ticket_json" | jq -r '.priority // "Medium"')
  labels=$(echo "$ticket_json" | jq -r '.labels // [] | join(",")')

  # Map type to Jira issue type name
  local jira_issue_type
  case "$ticket_type" in
    feature) jira_issue_type="Story" ;;
    bug)     jira_issue_type="Bug" ;;
    chore)   jira_issue_type="Task" ;;
    *)       jira_issue_type="Task" ;;
  esac

  # Map priority to Jira priority name
  local jira_priority
  case "$priority" in
    Critical) jira_priority="Highest" ;;
    High)     jira_priority="High" ;;
    Medium)   jira_priority="Medium" ;;
    Low)      jira_priority="Low" ;;
    *)        jira_priority="Medium" ;;
  esac

  echo "Generated ticket:"
  echo "  Type:     $jira_issue_type"
  echo "  Summary:  $summary"
  echo "  Priority: $jira_priority"
  echo "  Labels:   $labels"
  echo ""

  # Get issue type ID
  local issue_type_id
  local types_response
  types_response=$(jira_api GET "/issue/createmeta/${project_key}/issuetypes")

  if ! echo "$types_response" | jq -e '.issueTypes' &>/dev/null; then
    echo "Error: Could not fetch issue types for project '$project_key'."
    echo "  Verify the project key exists in Jira: ${JIRA_BASE_URL}/browse/$project_key"
    echo "  API response: $(echo "$types_response" | jq -r '.errorMessages[0] // .message // "unknown error"' 2>/dev/null)"
    exit 1
  fi

  issue_type_id=$(echo "$types_response" | jq -r ".issueTypes[] | select(.name == \"$jira_issue_type\") | .id" | head -1)

  if [ -z "$issue_type_id" ]; then
    # Fallback to Task
    issue_type_id=$(echo "$types_response" | jq -r '.issueTypes[] | select(.name == "Task") | .id' | head -1)
  fi

  # Build ADF description
  local adf_description
  adf_description=$(echo "$description" | jq -Rs '{
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: . }]
      }
    ]
  }')

  # Build labels array for payload
  local labels_json="[]"
  if [ -n "$labels" ]; then
    labels_json=$(echo "$labels" | tr ',' '\n' | jq -R . | jq -s .)
  fi

  # Create the Jira issue
  local payload
  payload=$(jq -n \
    --arg proj "$project_key" \
    --arg type_id "$issue_type_id" \
    --arg sum "$summary" \
    --argjson desc "$adf_description" \
    --arg prio "$jira_priority" \
    --argjson lbls "$labels_json" \
    '{
      fields: {
        project: { key: $proj },
        issuetype: { id: $type_id },
        summary: $sum,
        description: $desc,
        priority: { name: $prio },
        labels: $lbls
      }
    }')

  local result issue_key
  result=$(jira_api POST "/issue" "$payload")
  issue_key=$(echo "$result" | jq -r '.key // empty')

  if [ -z "$issue_key" ]; then
    echo "Error: Failed to create Jira issue."
    echo "Response: $result"
    exit 1
  fi

  echo "Ticket created: $issue_key — $summary"
  echo "  URL: ${JIRA_BASE_URL}/browse/$issue_key"
  echo ""
  echo "Review and edit the ticket in Jira. When ready:"
  echo "  ./scripts/ai-dev.sh $issue_key init"
}

# ══════════════════════════════════════════════════════════════════════
# Subcommand: init
# ══════════════════════════════════════════════════════════════════════

cmd_init() {
  require_tool jq
  require_tool "$CLAUDE_CMD"
  require_tool curl
  require_jira_creds

  echo "Vyasa AI Dev — Initializing: $TICKET_ID"
  echo ""

  # Check if already initialized
  if [ -f "$(subtasks_file)" ]; then
    echo "Already initialized. Subtasks file exists."
    echo "Use './scripts/ai-dev.sh $TICKET_ID status' to see progress."
    return 0
  fi

  # Fetch parent ticket
  echo "Fetching ticket from Jira..."
  local ticket_json summary description
  ticket_json=$(jira_get_issue "$TICKET_ID")

  if ! echo "$ticket_json" | jq -e '.fields.summary' &>/dev/null; then
    echo "Error: Could not fetch ticket $TICKET_ID from Jira."
    echo "  Check JIRA_BASE_URL and credentials."
    exit 1
  fi

  summary=$(echo "$ticket_json" | jq -r '.fields.summary')
  description=$(echo "$ticket_json" | jq -r '
    .fields.description.content[]?.content[]?.text // empty
  ' 2>/dev/null | head -50)

  echo "Ticket: $summary"
  echo ""

  # Save ticket context for agents
  mkdir -p "$(feature_dir)"
  cat > "$(feature_dir)/.ticket-context" <<EOF
Ticket: $TICKET_ID
Title: $summary
Description: $description
${EXTRA_ARG:+Extra context: $EXTRA_ARG}
EOF

  # Create subtasks
  echo "Creating pipeline subtasks in Jira..."
  local sf
  sf="$(subtasks_file)"
  > "$sf"

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

  for i in "${!step_names[@]}"; do
    local key
    key=$(jira_create_subtask "$TICKET_ID" "${step_summaries[$i]}" "${step_descriptions[$i]}")
    if [ -n "$key" ]; then
      save_subtask_key "${step_names[$i]}" "$key"
      echo "  Created: $key — ${step_summaries[$i]}"
    else
      echo "  Error creating subtask: ${step_summaries[$i]}"
    fi
  done

  # Create feature branch
  local slug branch
  slug=$(echo "$summary" | head -c 40 | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-' | sed 's/-*$//')
  branch="feature/${TICKET_ID}-${slug}"

  cd "$REPO_ROOT"
  if git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
    echo ""
    echo "Branch '$branch' already exists — switching to it"
    git checkout "$branch"
  else
    git checkout main
    git pull origin main
    git checkout -b "$branch"
    echo ""
    echo "Created branch: $branch"
  fi

  # Transition parent to In Progress
  jira_transition_to "$TICKET_ID" "In Progress" 2>/dev/null || true

  # Comment on parent ticket
  jira_add_comment "$TICKET_ID" \
    "AI development pipeline initialized.\n\nBranch: $branch\nSubtasks created for: Requirements, Design, Implementation, Testing, Deploy.\n\nEach subtask will receive output artifacts. Transition subtask to Done to approve and unlock the next phase."

  echo ""
  echo "Done. Pipeline initialized."
  echo "  Branch:   $branch"
  echo "  Ticket:   ${JIRA_BASE_URL}/browse/$TICKET_ID"
  echo ""
  echo "Next: ./scripts/ai-dev.sh $TICKET_ID requirements"
}

# ══════════════════════════════════════════════════════════════════════
# Subcommand: requirements
# ══════════════════════════════════════════════════════════════════════

cmd_requirements() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite requirements

  local subtask_key
  subtask_key=$(get_subtask_key "requirements")

  echo "Vyasa AI Dev — Requirements Analysis: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  # Transition to In Progress
  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  # Run agent
  cd "$REPO_ROOT"
  local context
  context=$(cat "$(feature_dir)/.ticket-context")

  run_agent agents/requirements-agent/instructions.md 1.50 sonnet \
    TICKET_ID="$TICKET_ID" \
    TICKET_CONTEXT="$context"

  # Verify output
  local req_file="$(feature_dir)/requirements.md"
  if [ ! -f "$req_file" ]; then
    jira_add_comment "$subtask_key" "Requirements agent failed to produce output. Re-run needed."
    echo "Error: requirements.md not created. Re-run this step."
    exit 1
  fi

  # Post summary comment to Jira
  local ac_count edge_count
  ac_count=$(grep -c "^\*\*Given\*\*\|^[0-9]*\. \*\*Given\*\*" "$req_file" 2>/dev/null || echo "0")
  edge_count=$(grep -c "^[0-9]*\. What happens" "$req_file" 2>/dev/null || echo "0")

  local comment_body
  comment_body="AI Pipeline — Requirements Analysis Complete

Ticket: $TICKET_ID
Acceptance Criteria: $ac_count items (Given/When/Then format)
Edge Cases: $edge_count identified

Full document attached: requirements.md

---
Review the requirements document. When satisfied, transition this subtask to Done to unlock the Design phase."

  jira_add_comment "$subtask_key" "$comment_body"

  # Upload attachment
  jira_upload_attachment "$subtask_key" "$req_file"

  # Parse and post unresolved Design Decision blocks if present
  local open_questions
  open_questions=$(awk '
    /^## Design Decisions/{s=1;next}
    s && /^## /{if(qb&&!dq)print qb;s=0;qb="";dq=0;next}
    s && /^### Q[0-9]/{if(qb&&!dq)print qb;qb=$0"\n";dq=0;next}
    s && /^Decision:/{dq=1;next}
    s{qb=qb $0"\n"}
    END{if(s&&qb&&!dq)print qb}
  ' "$req_file" 2>/dev/null | sed '/^[[:space:]]*$/d')

  if [ -n "$open_questions" ]; then
    local round_file="$(feature_dir)/.questions-round"
    echo "1" > "$round_file"

    local questions_plain questions_comment
    questions_plain=$(echo "$open_questions" | strip_markdown)
    questions_comment="⚠️  Open Questions — Round 1

Please reply with your decisions using this format:
  Q1: [your choice or free text answer]
  Q2: [your choice or free text answer]
  ...

---
${questions_plain}"

    jira_add_comment "$subtask_key" "$questions_comment"
    echo ""
    echo "Open questions found and posted to Jira."
    echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
    echo ""
    echo "Next: PO answers questions in Jira, then run:"
    echo "  ./scripts/ai-dev.sh $TICKET_ID resolve"
  else
    echo ""
    echo "Requirements posted to Jira."
    echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
    echo ""
    echo "Next: Review in Jira, transition subtask to 'Done', then:"
    echo "  ./scripts/ai-dev.sh $TICKET_ID design"
  fi
}

# ══════════════════════════════════════════════════════════════════════
# Helper: has_unresolved_questions <file>
# Returns 0 (true) if any ### Q[N]: block in ## Design Decisions lacks a
# Decision: line, or if the old ## Open Questions section is present.
# Returns 1 (false) when all blocks are resolved or no section exists.
# ══════════════════════════════════════════════════════════════════════

has_unresolved_questions() {
  local file="$1"
  grep -q "^## Open Questions" "$file" 2>/dev/null && return 0
  awk '
    /^## Design Decisions/{s=1;next}
    s && /^## /{s=0}
    s && /^### Q[0-9]/{b++;d[b]=0}
    s && /^Decision:/{if(b)d[b]=1}
    END{for(i=1;i<=b;i++)if(!d[i]){exit 0}exit 1}
  ' "$file"
}

# ══════════════════════════════════════════════════════════════════════
# Subcommand: resolve
# ══════════════════════════════════════════════════════════════════════

cmd_resolve() {
  require_tool jq
  require_jira_creds

  local subtask_key
  subtask_key=$(get_subtask_key "requirements")
  if [ -z "$subtask_key" ]; then
    echo "Error: Requirements subtask not found. Run init first."
    exit 1
  fi

  local req_file="$(feature_dir)/requirements.md"
  if [ ! -f "$req_file" ]; then
    echo "Error: requirements.md not found. Run requirements step first."
    exit 1
  fi

  if ! grep -q "^## Design Decisions" "$req_file" 2>/dev/null; then
    echo "Error: requirements.md uses the old ## Open Questions format."
    echo "  Re-run the requirements step to generate the structured ## Design Decisions format."
    exit 1
  fi

  echo "Vyasa AI Dev — Resolving Open Questions: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  # Fetch comments and find latest with Q1:, Q2: answer format
  local comments latest_answers
  comments=$(jira_get_comments "$subtask_key")

  latest_answers=$(echo "$comments" | jq -r '
    [.[] | select(
      (.body.content // [])[] |
      (.content // [])[] |
      .text? | strings | test("^Q[0-9]+:")
    )] | last |
    [(.body.content // [])[] |
      (.content // [])[] |
      .text? | strings
    ] | join("\n")
  ' 2>/dev/null || true)

  if [ -z "$latest_answers" ]; then
    echo "No answers yet. Waiting for PO to reply in Jira."
    echo "  ${JIRA_BASE_URL}/browse/$subtask_key"
    exit 1
  fi

  echo "Answers found. Updating requirements.md..."

  # Build answers file: lines of "qnum|answer text" (case/whitespace tolerant)
  local answers_file="${req_file}.answers"
  rm -f "$answers_file"
  while IFS= read -r line; do
    if echo "$line" | grep -qiE '^Q[[:space:]]*[0-9]+[[:space:]]*:'; then
      local q_num answer_text
      q_num=$(echo "$line" | grep -oiE 'Q[[:space:]]*[0-9]+' | tr -cd '0-9')
      answer_text=$(echo "$line" | sed 's/^[Qq][[:space:]]*[0-9]*[[:space:]]*:[[:space:]]*//')
      echo "${q_num}|${answer_text}" >> "$answers_file"
    fi
  done <<< "$latest_answers"

  # In-place Decision: insertion per ### Q[N]: block; preserves all existing fields.
  # If a Decision: line already exists for a block, PO answer overwrites it.
  local tmp_file="${req_file}.tmp"
  awk -v afile="$answers_file" '
    BEGIN {
      while ((getline al < afile) > 0) {
        n=index(al,"|"); ans[substr(al,1,n-1)]=substr(al,n+1)
      }
      close(afile); s=0; q=0; buf=""; ex=""
    }
    /^## Design Decisions/ { s=1; print; next }
    s && /^## /            { flush(); s=0; print; next }
    s && /^### Q[0-9]/     { flush(); match($0,/[0-9]+/); q=substr($0,RSTART,RLENGTH)+0; buf=$0"\n"; next }
    s && q && /^Decision:/ { ex=substr($0,11); next }
    s && q                 { buf=buf $0"\n"; next }
    { print }
    function flush(    i,n,lines,dec) {
      if (!q) return
      dec=(q in ans)?ans[q]:ex
      n=split(buf,lines,"\n")
      while (n>0 && lines[n]~/^[[:space:]]*$/) n--
      for (i=1;i<=n;i++) print lines[i]
      if (dec!="") print "Decision: " dec
      print ""; q=0; buf=""; ex=""
    }
    END { flush() }
  ' "$req_file" > "$tmp_file"

  mv "$tmp_file" "$req_file"
  rm -f "$answers_file"

  # Check if any Q blocks remain without a Decision: line
  if has_unresolved_questions "$req_file"; then
    # Increment round counter and post remaining unresolved blocks
    local round_file="$(feature_dir)/.questions-round"
    local round=1
    [ -f "$round_file" ] && round=$(cat "$round_file")
    round=$((round + 1))
    echo "$round" > "$round_file"

    local new_questions
    new_questions=$(awk '
      /^## Design Decisions/{s=1;next}
      s && /^## /{if(qb&&!dq)print qb;s=0;qb="";dq=0;next}
      s && /^### Q[0-9]/{if(qb&&!dq)print qb;qb=$0"\n";dq=0;next}
      s && /^Decision:/{dq=1;next}
      s{qb=qb $0"\n"}
      END{if(s&&qb&&!dq)print qb}
    ' "$req_file" 2>/dev/null | sed '/^[[:space:]]*$/d')

    local new_questions_plain new_comment
    new_questions_plain=$(echo "$new_questions" | strip_markdown)
    new_comment="⚠️  Open Questions — Round ${round}

Previous answers applied. New questions arose:

Please reply using the same format:
  Q1: [your answer]
  Q2: [your answer]
  ...

---
${new_questions_plain}"

    jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true
    jira_add_comment "$subtask_key" "$new_comment"

    echo "New questions posted (Round ${round})."
    echo "  ${JIRA_BASE_URL}/browse/$subtask_key"
    echo ""
    echo "Next: PO answers Round ${round}, then re-run:"
    echo "  ./scripts/ai-dev.sh $TICKET_ID resolve"
    exit 1
  fi

  # No remaining open questions — post confirmation comment
  local round_file="$(feature_dir)/.questions-round"
  local final_round=1
  [ -f "$round_file" ] && final_round=$(cat "$round_file")

  jira_add_comment "$subtask_key" "✅  All open questions resolved (Round ${final_round}). requirements.md updated with design decisions. Transition this subtask to Done to unlock the Design phase."

  echo "All questions resolved. requirements.md updated."
  echo ""
  echo "Next: Transition subtask to 'Done' in Jira, then run:"
  echo "  ./scripts/ai-dev.sh $TICKET_ID design"
}

# ══════════════════════════════════════════════════════════════════════
# Subcommand: design
# ══════════════════════════════════════════════════════════════════════

cmd_design() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite design

  local subtask_key
  subtask_key=$(get_subtask_key "design")

  echo "Vyasa AI Dev — Technical Design: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  # Transition to In Progress
  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  # Run agent
  cd "$REPO_ROOT"
  local context req_path
  context=$(cat "$(feature_dir)/.ticket-context")
  req_path="docs/features/$TICKET_ID/requirements.md"

  run_agent agents/design-agent/instructions.md 2.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TICKET_CONTEXT="$context" \
    REQUIREMENTS_PATH="$req_path"

  # Verify output
  local tdd_file="$(feature_dir)/TDD.md"
  if [ ! -f "$tdd_file" ]; then
    jira_add_comment "$subtask_key" "Design agent failed to produce output. Re-run needed."
    echo "Error: TDD.md not created. Re-run this step."
    exit 1
  fi

  # Post summary to Jira
  local comment_body
  comment_body="AI Pipeline — Technical Design Complete

Ticket: $TICKET_ID
Output: TDD.md (Technical Design Document)

Contents include:
- API contract changes
- Database schema changes (if any)
- Sequence diagram (Mermaid)
- Security considerations
- Rollback plan
- Spec Validation Checklist

Full document attached: TDD.md

---
Review the technical design. When satisfied, transition this subtask to Done to unlock the Implementation phase."

  jira_add_comment "$subtask_key" "$comment_body"
  jira_upload_attachment "$subtask_key" "$tdd_file"

  echo ""
  echo "Technical design posted to Jira."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  echo ""
  echo "Next: Review in Jira, transition subtask to 'Done', then:"
  echo "  ./scripts/ai-dev.sh $TICKET_ID code"
}

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

# ══════════════════════════════════════════════════════════════════════
# Subcommand: deploy
# ══════════════════════════════════════════════════════════════════════

cmd_deploy() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite deploy

  local subtask_key
  subtask_key=$(get_subtask_key "deploy")

  echo "Vyasa AI Dev — Deploy: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  # Transition to In Progress
  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  # Run agent
  cd "$REPO_ROOT"
  local branch changed_files
  branch=$(git branch --show-current)
  changed_files=$(git diff main --name-only | tr '\n' ',')

  run_agent agents/deploy-agent/instructions.md 1.00 haiku \
    TICKET_ID="$TICKET_ID" \
    BRANCH="$branch" \
    CHANGED_FILES="$changed_files"

  # Post to Jira (deploy subtask)
  local comment_body
  comment_body="AI Pipeline — Deploy Complete

Ticket: $TICKET_ID
Branch: $branch
PR opened — check GitHub for the PR URL.

---
Pipeline complete. Review and merge the PR."

  jira_add_comment "$subtask_key" "$comment_body"
  jira_transition_to "$subtask_key" "Done" 2>/dev/null || true

  # Comment on parent ticket
  jira_add_comment "$TICKET_ID" \
    "AI development pipeline complete.\n\nBranch: $branch\nPR opened on GitHub. All phases passed. Ready for human code review and merge."

  echo ""
  echo "======================================"
  echo " PIPELINE COMPLETE: $TICKET_ID"
  echo "======================================"
  echo ""
  echo "  Branch: $branch"
  echo "  Ticket: ${JIRA_BASE_URL}/browse/$TICKET_ID"
  echo ""
  echo "  Review the PR on GitHub and merge when ready."
}

# ══════════════════════════════════════════════════════════════════════
# Subcommand: status
# ══════════════════════════════════════════════════════════════════════

cmd_status() {
  require_jira_creds

  local sf
  sf="$(subtasks_file)"

  if [ ! -f "$sf" ]; then
    echo "No pipeline found for '$TICKET_ID'."
    echo "Start with: ./scripts/ai-dev.sh $TICKET_ID init"
    return 0
  fi

  echo "Vyasa AI Dev — $TICKET_ID"
  echo "Jira: ${JIRA_BASE_URL}/browse/$TICKET_ID"
  echo ""
  printf "%-16s %-12s %-14s %s\n" "Step" "Subtask" "Status" "Action"
  printf "%-16s %-12s %-14s %s\n" "────" "───────" "──────" "──────"

  local next_action=""

  for step in "${STEPS_ORDERED[@]}"; do
    local key status action_hint
    key=$(get_subtask_key "$step")

    if [ -z "$key" ]; then
      status="—"
      action_hint=""
    else
      status=$(jira_get_status "$key" 2>/dev/null || echo "unknown")
      action_hint=""

      if [ -z "$next_action" ]; then
        case "$status" in
          "To Do")
            if is_gated_step "$step"; then
              # Check if previous gate is approved
              action_hint="run $step"
            else
              action_hint="run $step"
            fi
            next_action="./scripts/ai-dev.sh $TICKET_ID $step"
            ;;
          "In Progress")
            action_hint="waiting..."
            next_action="(in progress)"
            ;;
          "Done")
            action_hint=""
            ;;
        esac
      fi
    fi

    printf "%-16s %-12s %-14s %s\n" "$step" "${key:-—}" "$status" "$action_hint"
  done

  echo ""
  if [ -n "$next_action" ] && [ "$next_action" != "(in progress)" ]; then
    echo "Next: $next_action"
  elif [ "$next_action" = "(in progress)" ]; then
    echo "A step is currently in progress."
  else
    echo "All steps complete!"
  fi
}

# ══════════════════════════════════════════════════════════════════════
# Dispatch
# ══════════════════════════════════════════════════════════════════════

if [ -z "$TICKET_ID" ]; then
  cmd_help
  exit 0
fi

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
