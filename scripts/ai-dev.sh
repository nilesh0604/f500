#!/bin/bash
# ai-dev.sh — Trigger the AI orchestrator for a given ticket
#
# Usage:
#   ./scripts/ai-dev.sh JIRA-456
#   ./scripts/ai-dev.sh JIRA-456 "Optional extra context about the ticket"
#
# Requirements:
#   - claude CLI installed: npm install -g @anthropic-ai/claude-code
#   - JIRA_API_TOKEN env var set (for Jira ticket fetch)
#   - JIRA_URL env var set (e.g. https://yourcompany.atlassian.net)
#   - JIRA_EMAIL env var set

set -euo pipefail

TICKET_ID="${1:-}"
EXTRA_CONTEXT="${2:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Validate inputs ────────────────────────────────────────────────
if [ -z "$TICKET_ID" ]; then
  echo "❌ Usage: ./scripts/ai-dev.sh TICKET-ID [extra context]"
  echo "   Example: ./scripts/ai-dev.sh JIRA-456"
  exit 1
fi

# ── Check prerequisites ────────────────────────────────────────────
if ! command -v claude &> /dev/null; then
  echo "❌ claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
  exit 1
fi

echo "🤖 OrderFlow AI Dev — Ticket: $TICKET_ID"
echo "📁 Repo: $REPO_ROOT"
echo ""

# ── Fetch ticket from Jira (if credentials available) ─────────────
TICKET_CONTEXT=""

if [ -n "${JIRA_API_TOKEN:-}" ] && [ -n "${JIRA_URL:-}" ] && [ -n "${JIRA_EMAIL:-}" ]; then
  echo "📋 Fetching ticket from Jira..."
  TICKET_JSON=$(curl -s \
    -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "${JIRA_URL}/rest/api/3/issue/${TICKET_ID}" 2>/dev/null || echo "")

  if echo "$TICKET_JSON" | jq -e '.fields.summary' &>/dev/null; then
    SUMMARY=$(echo "$TICKET_JSON" | jq -r '.fields.summary')
    DESCRIPTION=$(echo "$TICKET_JSON" | jq -r '.fields.description.content[0].content[0].text // "No description"' 2>/dev/null || echo "No description")
    TICKET_CONTEXT="Ticket: $TICKET_ID
Title: $SUMMARY
Description: $DESCRIPTION
${EXTRA_CONTEXT:+Extra context: $EXTRA_CONTEXT}"
    echo "✅ Ticket fetched: $SUMMARY"
  else
    echo "⚠️  Could not fetch ticket from Jira — using ticket ID only"
    TICKET_CONTEXT="Ticket: $TICKET_ID
${EXTRA_CONTEXT:+Context: $EXTRA_CONTEXT}
Note: Jira fetch failed — work from ticket ID and any provided context."
  fi
else
  echo "ℹ️  Jira credentials not set — using ticket ID and provided context"
  TICKET_CONTEXT="Ticket: $TICKET_ID
${EXTRA_CONTEXT:+Context: $EXTRA_CONTEXT}
Note: Set JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN env vars to auto-fetch ticket details."
fi

echo ""
echo "🚀 Starting orchestrator..."
echo "   Max turns: 50"
echo "   Agent instructions: agents/orchestrator/instructions.md"
echo ""

# ── Run orchestrator ───────────────────────────────────────────────
cd "$REPO_ROOT"

claude -p agents/orchestrator/instructions.md \
  --var TICKET_ID="$TICKET_ID" \
  --var TICKET_CONTEXT="$TICKET_CONTEXT" \
  --max-turns 50

echo ""
echo "✅ Orchestrator finished for $TICKET_ID"
