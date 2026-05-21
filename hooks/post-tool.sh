#!/bin/bash
# post-tool.sh — Runs AFTER every agent tool call
# Usage: called automatically by Claude Code hooks system
# Args: $1 = tool name, $2 = file path (if applicable), $3 = exit code of the tool

TOOL_NAME="${1:-unknown}"
FILE_PATH="${2:-}"
TOOL_EXIT_CODE="${3:-0}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AUDIT_LOG=".cloud/audit.log"
STATUS="OK"

[ "$TOOL_EXIT_CODE" != "0" ] && STATUS="FAIL"

# ── Audit trail ────────────────────────────────────────────────────
echo "${TIMESTAMP} | POST | ${TOOL_NAME} | ${FILE_PATH} | ${STATUS}" >> "$AUDIT_LOG"

# ── Auto-lint TypeScript files after write ─────────────────────────
if [ -n "$FILE_PATH" ] && echo "$FILE_PATH" | grep -qE "\.(ts|tsx)$"; then
  if [ -f "$FILE_PATH" ]; then
    echo "🔍 Running ESLint on ${FILE_PATH}..."
    npx eslint --fix "$FILE_PATH" --quiet 2>/dev/null
    LINT_EXIT=$?
    if [ "$LINT_EXIT" != "0" ]; then
      echo "⚠️  ESLint found issues in ${FILE_PATH} — review before committing" >&2
    fi
  fi
fi

# ── Warn if .env was modified (should be blocked by pre-tool, but double-check) ──
if echo "$FILE_PATH" | grep -qE "\.env$|\.env\.[a-z]+$"; then
  echo "⚠️  WARNING: .env file was modified: ${FILE_PATH}" >&2
  echo "${TIMESTAMP} | WARN | .env modified | ${FILE_PATH}" >> "$AUDIT_LOG"
fi

# ── Log tool failure ───────────────────────────────────────────────
if [ "$TOOL_EXIT_CODE" != "0" ]; then
  echo "⚠️  Tool '${TOOL_NAME}' exited with code ${TOOL_EXIT_CODE}" >&2
fi

exit 0
