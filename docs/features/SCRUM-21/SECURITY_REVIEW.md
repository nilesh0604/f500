# Security Review — SCRUM-21

## Review Date

2026-06-16

## Files Reviewed

Application code (security-relevant):

- `apps/vyasa-slack-cmd/src/handlers/receiver.ts`
- `apps/vyasa-slack-cmd/src/handlers/worker.ts`
- `apps/vyasa-slack-cmd/src/lib/slack-verifier.ts`
- `apps/vyasa-slack-cmd/src/lib/response-url-validator.ts`
- `apps/vyasa-slack-cmd/src/lib/response-formatter.ts`
- `apps/vyasa-slack-cmd/src/lib/logger.ts`
- `libs/shared-types/src/lib/slack.types.ts`

## Findings Fixed (HIGH/CRITICAL)

None — no HIGH/CRITICAL vulnerabilities confirmed after false-positive filtering.

## Findings Investigated and Discarded

| #   | Finding                                               | OWASP | File:Line               | Verdict      | Reason                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------- | ----- | ----------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Null signing secret cached bypasses HMAC verification | A07   | receiver.ts:35,47       | DISCARD (FP) | `crypto.createHmac('sha256', undefined)` throws `TypeError` in Node.js v22 — Lambda crashes with 500, no auth bypass. Bad value not cached (falsy guard).                                                                                     |
| 2   | Unauthenticated RAG API call exposes knowledge base   | A01   | worker.ts:42-49         | DISCARD (FP) | The RAG `/chat` endpoint is already publicly accessible via API Gateway `lkbzhoe1pj`. Worker omitting an auth header introduces zero new attack surface; adding auth is a hardening gap against an already-public endpoint.                   |
| 3   | `timingSafeEqual` length-mismatch timing oracle       | A02   | slack-verifier.ts:31-37 | DISCARD (FP) | Correct Slack signature length (67 chars: `v0=` + 64 hex) is public in Slack API docs — oracle reveals no secret. Network jitter in Lambda/API Gateway (milliseconds) drowns out the microsecond-level throw-vs-comparison timing difference. |

## Findings for Human Review (MEDIUM/LOW)

| #   | Finding                                                                                                                          | OWASP | File:Line         | Recommendation                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `getSigningSecret()` returns `undefined` (runtime) if `signing_secret` key missing from Secrets Manager JSON — no explicit guard | A05   | receiver.ts:47-48 | Add `if (!cachedSigningSecret) throw new Error('signing_secret key missing from Secrets Manager payload');` after line 47. Currently causes Lambda 500 (availability impact only, not security). |
| 2   | Worker Lambda calls RAG `/chat` with no service-to-service auth                                                                  | A01   | worker.ts:42-49   | Add API key via Secrets Manager or SigV4 IAM auth before GA. Acceptable for PoC scope per ticket label, but must be resolved before production.                                                  |

## npm audit Summary

```
160 vulnerabilities (11 low, 90 moderate, 58 high, 1 critical)

Critical: shell-quote — quote() does not escape newlines in object .op values
  GHSA-w7jw-789q-3m8p — fix available via `npm audit fix`
  node_modules/shell-quote

High (58): ws, tar, and transitive dependencies
```

> NOTE: Per project security standards, third-party dependency vulnerabilities are tracked and remediated separately from feature PR reviews. These findings pre-date or are transitive to this PR and must be tracked in a dedicated dependency-management ticket. The `shell-quote` critical finding should be prioritized.

## TDD Security Considerations — Addressed

| TDD Item                                           | Status       | Notes                                                                             |
| -------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| HMAC-SHA256 signature verification on all requests | ✅ Addressed | `slack-verifier.ts` — constant-time comparison, 5-minute replay window            |
| Replay attack prevention (timestamp window)        | ✅ Addressed | `verifySlackSignature` rejects requests outside ±5-minute window                  |
| Signing secret from Secrets Manager (not env var)  | ✅ Addressed | `receiver.ts` — fetches from `SLACK_SECRET_ARN`, cached in memory                 |
| `response_url` validation (no SSRF)                | ✅ Addressed | `response-url-validator.ts` — pins host to `hooks.slack.com`, protocol to `https` |
| No PII in logs                                     | ✅ Addressed | Logger emits `questionLength`/`answerLength` counts only, never message content   |
| Async worker invocation (fire-and-forget)          | ✅ Addressed | `InvocationType: 'Event'` — receiver acks Slack within 3-second window            |
| Service-to-service auth for RAG calls              | ⚠️ Deferred  | PoC scope — RAG endpoint currently public. Must be resolved before production.    |

## Overall Verdict

**PASS_WITH_NOTES**

> No unresolved HIGH/CRITICAL exploitable vulnerabilities were found in the PR's application code. Two MEDIUM items are documented above for human review before production: (1) add a guard for missing `signing_secret` key in Secrets Manager payload, and (2) add service-to-service authentication on RAG API calls. The `shell-quote` critical dependency finding must be resolved in a separate ticket.
