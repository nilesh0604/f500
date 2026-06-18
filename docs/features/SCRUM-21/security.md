CLI Version │ 0.3.2
Profile │ global_sonet_4_6_profile
Provider │ ai-run-sso
Model │ sonnet
CodeMie URL │ https://codemie.lab.epam.com
Agent │ claude
Session │ 1285f462-3c5b-40cc-9a70-afc8f2c2485d

💪 You've got this. You've solved harder problems before, this one doesn't stand a chance.

# Security Review — SCRUM-21

## Review Date

2026-06-16

## Files Reviewed

- `apps/vyasa-slack-cmd/src/handlers/receiver.ts`
- `apps/vyasa-slack-cmd/src/handlers/worker.ts`
- `apps/vyasa-slack-cmd/src/lib/slack-verifier.ts`
- `apps/vyasa-slack-cmd/src/lib/response-url-validator.ts`
- `apps/vyasa-slack-cmd/src/lib/response-formatter.ts`
- `apps/vyasa-slack-cmd/src/lib/logger.ts`
- `libs/shared-types/src/lib/slack.types.ts`

---

## Findings Fixed (HIGH/CRITICAL)

None — no HIGH/CRITICAL vulnerabilities confirmed after false-positive filtering.

---

## Findings Investigated and Discarded

| #   | Finding                                                | OWASP | File:Line                 | Verdict      | Reason                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------ | ----- | ------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Null signing secret cached, bypasses HMAC verification | A07   | `receiver.ts:35,47`       | DISCARD (FP) | `crypto.createHmac('sha256', undefined)` throws `TypeError` in Node.js v22 — Lambda crashes with 500, no auth bypass. Bad value not cached (falsy guard prevents it).                                                       |
| 2   | Unauthenticated RAG API call exposes knowledge base    | A01   | `worker.ts:42-49`         | DISCARD (FP) | The RAG `/chat` endpoint is already publicly accessible via API Gateway `lkbzhoe1pj`. Worker omitting an auth header introduces zero new attack surface; this is a hardening gap against an already-public endpoint.        |
| 3   | `timingSafeEqual` length-mismatch timing oracle        | A02   | `slack-verifier.ts:31-37` | DISCARD (FP) | Correct Slack signature length (67 chars: `v0=` + 64 hex) is publicly documented — oracle reveals no secret. Network jitter in Lambda/API Gateway (ms range) drowns out the µs-level throw-vs-comparison timing difference. |

---

## Findings for Human Review (MEDIUM/LOW)

| #   | Finding                                                                                                                         | OWASP | File:Line           | Recommendation                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `getSigningSecret()` silently returns `undefined` if `signing_secret` key missing from Secrets Manager JSON — no explicit guard | A05   | `receiver.ts:47-48` | Add `if (!cachedSigningSecret) throw new Error('signing_secret key missing')` after line 47. Currently causes Lambda 500 (availability impact only, not a security bypass). |
| 2   | Worker Lambda calls RAG `/chat` with no service-to-service authentication                                                       | A01   | `worker.ts:42-49`   | Add API key via Secrets Manager or SigV4 IAM auth before GA. Acceptable for PoC scope, must be resolved before production.                                                  |

---

## npm audit Summary

```
160 vulnerabilities (11 low, 90 moderate, 58 high, 1 critical)

Critical: shell-quote — GHSA-w7jw-789q-3m8p
  quote() does not escape newlines in .op values
  node_modules/shell-quote — fix available via `npm audit fix`
```

These are pre-existing/transitive dependencies, excluded per review scope (handled separately). The `shell-quote` critical should be prioritized in a dependency-management ticket.

---

## TDD Security Considerations — Addressed

| TDD Item                                           | Status       | Notes                                                                      |
| -------------------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| HMAC-SHA256 signature verification on all requests | ✅ Addressed | `slack-verifier.ts` — constant-time compare, 5-min replay window           |
| Replay attack prevention                           | ✅ Addressed | Rejects requests outside ±5-minute timestamp window                        |
| Signing secret from Secrets Manager                | ✅ Addressed | Fetched via `SLACK_SECRET_ARN`, cached in Lambda memory                    |
| `response_url` validation (SSRF prevention)        | ✅ Addressed | Pinned to `https://hooks.slack.com` — host + protocol enforced             |
| No PII in logs                                     | ✅ Addressed | Logs `questionLength`/`answerLength` counts only, never content            |
| Async worker invocation (Slack 3s ack window)      | ✅ Addressed | `InvocationType: 'Event'` — receiver returns immediately                   |
| Service-to-service auth for RAG calls              | ⚠️ Deferred  | PoC scope — RAG endpoint currently public. Must resolve before production. |

---

## Overall Verdict

**PASS_WITH_NOTES**

No exploitable HIGH/CRITICAL vulnerabilities in the PR's application code. Two MEDIUM items deferred for human review before production: missing Secrets Manager key guard (`receiver.ts:47`) and absent service-to-service auth on RAG calls (`worker.ts:43`). The `shell-quote` critical dependency must be resolved in a separate ticket.

Shutting down...
🌍 The world needs your code. What you build today might change someone's life tomorrow.

Powered by AI/Run CodeMie CLI
