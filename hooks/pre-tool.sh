#!/bin/bash
# pre-tool.sh — Runs BEFORE every agent tool call
# Usage: called automatically by Claude Code hooks system
# Args: $1 = tool name, $2 = file path (if applicable)

TOOL_NAME="${1:-unknown}"
FILE_PATH="${2:-}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AUDIT_LOG=".cloud/audit.log"

mkdir -p .cloud

# ── Audit trail ────────────────────────────────────────────────────
echo "${TIMESTAMP} | PRE  | ${TOOL_NAME} | ${FILE_PATH}" >> "$AUDIT_LOG"

# ── Block force push ───────────────────────────────────────────────
if echo "$TOOL_NAME $FILE_PATH" | grep -q "push --force\|push -f"; then
  echo "❌ BLOCKED: Force push is not allowed. Branch protection is enforced." >&2
  exit 1
fi

# ── Block cdk destroy ──────────────────────────────────────────────
if echo "$TOOL_NAME $FILE_PATH" | grep -qi "cdk destroy"; then
  echo "❌ BLOCKED: cdk destroy requires manual execution outside of agents." >&2
  exit 1
fi

# ── Block prisma migrate reset ─────────────────────────────────────
if echo "$TOOL_NAME $FILE_PATH" | grep -qi "migrate reset"; then
  echo "❌ BLOCKED: prisma migrate reset would destroy all data." >&2
  exit 1
fi

# ── Secret pattern detection in file writes ────────────────────────
if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
  SECRET_PATTERNS=(
    "AKIA[0-9A-Z]{16}"
    "aws_secret_access_key"
    "-----BEGIN RSA PRIVATE KEY-----"
    "-----BEGIN OPENSSH PRIVATE KEY-----"
    "password\s*=\s*['\"][^'\"]{8,}"
    "api[_-]?key\s*=\s*['\"][^'\"]{16,}"
  )

  for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -qiE "$pattern" "$FILE_PATH" 2>/dev/null; then
      echo "❌ BLOCKED: Possible secret detected in ${FILE_PATH} (pattern: ${pattern})" >&2
      echo "   Remove the secret and use AWS Secrets Manager or environment variables instead." >&2
      exit 1
    fi
  done
fi

# ── Guard against writing to .env files ────────────────────────────
if echo "$FILE_PATH" | grep -qE "\.env$|\.env\.[a-z]+$"; then
  echo "❌ BLOCKED: Agents must not write to .env files." >&2
  exit 1
fi

exit 0
