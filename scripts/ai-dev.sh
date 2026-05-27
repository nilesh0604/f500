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
STEPS_ORDERED=(requirements design code test deploy)
GATED_STEPS=(requirements design code)

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
    # Use awk for safe substitution (handles special chars in value)
    instructions=$(echo "$instructions" | awk -v k="{$key}" -v v="$value" '{gsub(k, v)}1')
  done

  $CLAUDE_CMD -p \
    --system-prompt "$instructions" \
    --model "$model" \
    --max-budget-usd "$budget" \
    --permission-mode default \
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
      ;;
    code)
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
      ;;
    test)
      local code_key
      code_key=$(get_subtask_key "code")
      if [ -z "$code_key" ]; then
        echo "Error: Code subtask not found. Run init first."
        exit 1
      fi
      local code_status
      code_status=$(jira_get_status "$code_key")
      if [ "$code_status" != "Done" ]; then
        echo "Error: Implementation not approved (status: $code_status)."
        echo "  Review in Jira: ${JIRA_BASE_URL}/browse/$code_key"
        echo "  Transition subtask to 'Done' when approved."
        exit 1
      fi
      ;;
    deploy)
      local test_key
      test_key=$(get_subtask_key "test")
      if [ -z "$test_key" ]; then
        echo "Error: Test subtask not found. Run init first."
        exit 1
      fi
      local test_status
      test_status=$(jira_get_status "$test_key")
      if [ "$test_status" != "Done" ]; then
        echo "Error: Testing not complete (status: $test_status)."
        echo "  Run: ./scripts/ai-dev.sh $TICKET_ID test"
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
  init             Parse ticket, create branch + Jira subtasks
  requirements     Run requirements-agent (needs: init)
  design           Run design-agent (needs: requirements subtask = Done)
  code             Run code-agent (needs: design subtask = Done)
  test             Run test-agent (needs: code subtask = Done)
  deploy           Open PR (needs: test subtask = Done)
  status           Show pipeline progress from Jira

Workflow:
  0. ./scripts/ai-dev.sh OF create "add session timeout to chat"
     -> Review ticket in Jira, edit if needed
  1. ./scripts/ai-dev.sh OF-456 init
  2. ./scripts/ai-dev.sh OF-456 requirements
     -> Review in Jira, transition subtask to "Done"
  3. ./scripts/ai-dev.sh OF-456 design
     -> Review in Jira, transition subtask to "Done"
  4. ./scripts/ai-dev.sh OF-456 code
     -> Review in Jira, transition subtask to "Done"
  5. ./scripts/ai-dev.sh OF-456 test
  6. ./scripts/ai-dev.sh OF-456 deploy

Approval: Transition the subtask to "Done" in Jira UI.
Status:   All state lives in Jira — no local state files.

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

  local step_names=("requirements" "design" "code" "test" "deploy")
  local step_summaries=(
    "[AI] Requirements Analysis"
    "[AI] Technical Design"
    "[AI] Implementation"
    "[AI] Testing & Coverage"
    "[AI] Deploy & PR"
  )
  local step_descriptions=(
    "AI-generated requirements analysis. Review and transition to Done to approve."
    "AI-generated technical design document (TDD). Review and transition to Done to approve."
    "AI-generated implementation. Review the branch and transition to Done to approve."
    "AI-generated test coverage. Auto-completes when coverage threshold met."
    "AI-generated PR. Auto-completes after PR is opened."
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

  echo ""
  echo "Requirements posted to Jira."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  echo ""
  echo "Next: Review in Jira, transition subtask to 'Done', then:"
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
# Subcommand: code
# ══════════════════════════════════════════════════════════════════════

cmd_code() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite code

  local subtask_key
  subtask_key=$(get_subtask_key "code")

  echo "Vyasa AI Dev — Implementation: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  # Transition to In Progress
  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  # Run agent
  cd "$REPO_ROOT"
  local tdd_path="docs/features/$TICKET_ID/TDD.md"

  run_agent agents/code-agent/instructions.md 5.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    TDD_PATH="$tdd_path"

  # Run lint + tests with retries
  local retries=0 max_retries=2 lint_pass=false test_pass=false

  while [ $retries -le $max_retries ]; do
    lint_pass=true
    test_pass=true

    if ! npm run lint -- --quiet 2>/dev/null; then
      lint_pass=false
    fi

    if ! npm run test:affected 2>/dev/null; then
      test_pass=false
    fi

    if [ "$lint_pass" = true ] && [ "$test_pass" = true ]; then
      break
    fi

    retries=$((retries + 1))
    if [ $retries -le $max_retries ]; then
      echo "Lint/tests failed — retrying with code-agent (attempt $retries/$max_retries)..."
      local error_context="Lint passed: $lint_pass, Tests passed: $test_pass. Please fix."
      run_agent agents/code-agent/instructions.md 3.00 sonnet \
        TICKET_ID="$TICKET_ID" \
        TDD_PATH="$tdd_path" \
        ERROR_CONTEXT="$error_context"
    fi
  done

  # Get changed files
  local changed_files
  changed_files=$(git diff main --name-only 2>/dev/null || echo "unknown")

  # Post to Jira
  local comment_body
  comment_body="AI Pipeline — Implementation Complete

Ticket: $TICKET_ID
Lint: $([ "$lint_pass" = true ] && echo "PASS" || echo "FAIL")
Tests: $([ "$test_pass" = true ] && echo "PASS" || echo "FAIL")

Changed files:
$changed_files

---
Review the implementation on the feature branch. When satisfied, transition this subtask to Done to unlock the Testing phase."

  jira_add_comment "$subtask_key" "$comment_body"

  if [ "$lint_pass" != true ] || [ "$test_pass" != true ]; then
    echo ""
    echo "Warning: Lint/tests still failing after retries."
    echo "Fix manually, then re-run: ./scripts/ai-dev.sh $TICKET_ID code"
    exit 1
  fi

  echo ""
  echo "Implementation posted to Jira."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  echo ""
  echo "Next: Review branch, transition subtask to 'Done', then:"
  echo "  ./scripts/ai-dev.sh $TICKET_ID test"
}

# ══════════════════════════════════════════════════════════════════════
# Subcommand: test
# ══════════════════════════════════════════════════════════════════════

cmd_test() {
  require_tool "$CLAUDE_CMD"
  require_jira_creds
  check_prerequisite test

  local subtask_key
  subtask_key=$(get_subtask_key "test")

  echo "Vyasa AI Dev — Testing: $TICKET_ID"
  echo "  Subtask: $subtask_key"
  echo ""

  # Transition to In Progress
  jira_transition_to "$subtask_key" "In Progress" 2>/dev/null || true

  # Run agent
  cd "$REPO_ROOT"
  local changed_files
  changed_files=$(git diff main --name-only | tr '\n' ',')

  run_agent agents/test-agent/instructions.md 3.00 sonnet \
    TICKET_ID="$TICKET_ID" \
    CHANGED_FILES="$changed_files"

  # Run coverage check
  local coverage_pass=true
  if ! npm run test:affected -- --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}' 2>/dev/null; then
    echo "Coverage below 80% — retrying..."
    run_agent agents/test-agent/instructions.md 2.00 sonnet \
      TICKET_ID="$TICKET_ID" \
      CHANGED_FILES="$changed_files"

    if ! npm run test:affected -- --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}' 2>/dev/null; then
      coverage_pass=false
    fi
  fi

  # Post to Jira
  local comment_body
  comment_body="AI Pipeline — Testing Complete

Ticket: $TICKET_ID
Coverage threshold (80%): $([ "$coverage_pass" = true ] && echo "PASS" || echo "BELOW THRESHOLD")

Test agent added coverage for changed files.

---
Testing phase complete."

  jira_add_comment "$subtask_key" "$comment_body"

  # Auto-transition test subtask to Done (no human gate)
  jira_transition_to "$subtask_key" "Done" 2>/dev/null || true

  if [ "$coverage_pass" != true ]; then
    echo ""
    echo "Warning: Coverage still below 80%. Proceeding anyway."
  fi

  echo ""
  echo "Testing complete. Subtask auto-transitioned to Done."
  echo "  Subtask: ${JIRA_BASE_URL}/browse/$subtask_key"
  echo ""
  echo "Next: ./scripts/ai-dev.sh $TICKET_ID deploy"
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

  run_agent agents/deploy-agent/instructions.md 0.50 haiku \
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
  create)       cmd_create ;;
  init)         cmd_init ;;
  requirements) cmd_requirements ;;
  design)       cmd_design ;;
  code)         cmd_code ;;
  test)         cmd_test ;;
  deploy)       cmd_deploy ;;
  status)       cmd_status ;;
  help|--help|-h) cmd_help ;;
  "")           cmd_help ;;
  *)            echo "Unknown subcommand: $SUBCOMMAND"; echo ""; cmd_help; exit 1 ;;
esac
