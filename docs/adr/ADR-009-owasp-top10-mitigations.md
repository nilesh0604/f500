# ADR-009: OWASP Top 10 Mitigations

**Status:** Accepted  
**Date:** 2026-05-12  
**Deciders:** Platform Team  
**Phase:** Phase 7 — Security Hardening (Week 9)

---

## Context

OrderFlow must address all OWASP Top 10 (2021) risks before a production
deployment. This ADR maps each risk to the concrete mitigations implemented in
the codebase and infrastructure.

---

## Decision

Implement defence-in-depth controls covering every OWASP Top 10 category.
Evidence links point to the specific code/config artefacts.

---

## OWASP Top 10 (2021) Mitigation Map

### A01 — Broken Access Control

| Control                                                   | Implementation                                         |
| --------------------------------------------------------- | ------------------------------------------------------ |
| JWT RS256 authentication on all `/v1/*` routes            | `libs/auth/src/lib/authenticate.middleware.ts`         |
| Per-user resource scoping (`order.userId === req.userId`) | `apps/order-service/src/app/services/order.service.ts` |
| IAM least-privilege task roles per service                | `infra/lib/security-stack.ts`                          |
| ECS `enableExecuteCommand` disabled in production         | `infra/lib/ecs-stack.ts`                               |
| Right-to-deletion (GDPR Art.17) soft-delete               | `apps/order-service/src/app/services/auth.service.ts`  |

### A02 — Cryptographic Failures

| Control                                                       | Implementation                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Passwords hashed with bcrypt (cost 12)                        | `apps/order-service/src/app/services/auth.service.ts`                                    |
| JWT signed RS256 (asymmetric, 2048-bit)                       | `libs/auth/src/lib/jwt.service.ts`                                                       |
| Access tokens expire in 15 min; refresh in 7 days             | `libs/auth/src/lib/jwt.service.ts`                                                       |
| RDS, S3, Redis encrypted at rest                              | `infra/lib/database-stack.ts`, `infra/lib/cdn-stack.ts`                                  |
| Redis `transitEncryptionEnabled: true` (TLS)                  | `infra/lib/database-stack.ts`                                                            |
| Secrets stored in AWS Secrets Manager, never env-vars in code | `infra/lib/security-stack.ts`                                                            |
| TLS 1.2 minimum on CloudFront; HSTS header in production      | `infra/lib/cdn-stack.ts`, `apps/order-service/src/app/middleware/security.middleware.ts` |

### A03 — Injection

| Control                                                    | Implementation                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| All DB queries via Prisma ORM (parameterised, no raw SQL)  | `apps/order-service/src/app/services/order.service.ts`     |
| All inputs validated with Zod schemas before use           | `apps/order-service/src/app/validation/`                   |
| Path parameter `:id` validated as UUID before DB lookup    | `apps/order-service/src/app/routes/orders.router.ts`       |
| AWS WAF SQLi managed rule set                              | `infra/lib/security-stack.ts` (AWSManagedRulesSQLiRuleSet) |
| SQS message bodies parsed + validated with Zod/EventSchema | `apps/notification-svc/src/app/consumers/sqs.consumer.ts`  |

### A04 — Insecure Design

| Control                                                  | Implementation                                         |
| -------------------------------------------------------- | ------------------------------------------------------ |
| Threat model documented                                  | `docs/THREAT_MODEL.md`                                 |
| Architecture Decision Records for every major choice     | `docs/adr/`                                            |
| Event-driven decoupling prevents direct service exposure | `infra/lib/event-stack.ts`                             |
| Idempotency keys prevent duplicate-order attacks         | `apps/order-service/src/app/services/order.service.ts` |
| Order state machine enforces valid transitions only      | `libs/shared-types` (`ORDER_STATUS_TRANSITIONS`)       |

### A05 — Security Misconfiguration

| Control                                                          | Implementation                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Helmet.js — base security headers                                | `apps/order-service/src/app/app.ts`                            |
| Custom CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy | `apps/order-service/src/app/middleware/security.middleware.ts` |
| Strict CORS allowlist (no wildcard `*` in production)            | `apps/order-service/src/app/middleware/security.middleware.ts` |
| `trust proxy 1` for correct IP behind ALB                        | `apps/order-service/src/app/app.ts`                            |
| VPC private subnets for all services; no `0.0.0.0/0` ingress     | `infra/lib/network-stack.ts`                                   |
| Container runs as non-root user (`appuser:1001`)                 | `apps/order-service/Dockerfile`                                |
| `express.json` body limit 100 KB                                 | `apps/order-service/src/app/app.ts`                            |

### A06 — Vulnerable and Outdated Components

| Control                                         | Implementation                        |
| ----------------------------------------------- | ------------------------------------- |
| `npm audit` in every PR (fail on critical/high) | `.github/workflows/pr-checks.yml`     |
| Snyk dependency scanning                        | `.github/workflows/security-scan.yml` |
| Dependabot automatic PR alerts                  | GitHub repository settings            |
| Trivy container image scanning on every build   | `.github/workflows/security-scan.yml` |
| SBOM generated per release (CycloneDX JSON)     | `.github/workflows/sbom.yml`          |
| License compliance — GPL/AGPL forbidden         | `.github/workflows/sbom.yml`          |

### A07 — Identification and Authentication Failures

| Control                                                        | Implementation                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| Password complexity enforced by Zod regex                      | `apps/order-service/src/app/validation/auth.schemas.ts`       |
| Password max length 72 (bcrypt limit)                          | `apps/order-service/src/app/validation/auth.schemas.ts`       |
| Generic error message on login failure (`Invalid credentials`) | `apps/order-service/src/app/services/auth.service.ts`         |
| IP-level rate limit 300 req/15 min; per-user 200 req/15 min    | `apps/order-service/src/app/app.ts`, `security.middleware.ts` |
| WAF rate-based rule 2000 req/5 min per IP                      | `infra/lib/security-stack.ts`                                 |
| JWT verification rejects expired/tampered tokens               | `libs/auth/src/lib/jwt.service.ts`                            |

### A08 — Software and Data Integrity Failures

| Control                                             | Implementation                                            |
| --------------------------------------------------- | --------------------------------------------------------- |
| Immutable container image tags (SHA-based) enforced | `.github/workflows/sbom.yml` (`verify-image-tags` job)    |
| Signed commits required (branch protection)         | `.github/CODEOWNERS`, repo settings                       |
| CodeQL + SonarQube SAST in every PR                 | `.github/workflows/security-scan.yml`                     |
| TruffleHog secret scanning on every PR              | `.github/workflows/security-scan.yml`                     |
| CDK Nag infrastructure compliance checks            | `.github/workflows/security-scan.yml`                     |
| SQS event payloads validated with Zod schemas       | `apps/notification-svc/src/app/consumers/sqs.consumer.ts` |

### A09 — Security Logging and Monitoring Failures

| Control                                                         | Implementation                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Structured JSON logs (Winston) with correlation IDs             | `libs/logger/src/lib/logger.ts`                                  |
| PII auto-redacted from all log messages and fields              | `libs/logger/src/lib/logger.ts` (PII_PATTERNS + PII_FIELD_NAMES) |
| Trace-to-log correlation (OpenTelemetry traceId/spanId)         | `libs/logger/src/lib/tracer.ts`                                  |
| Log-level routing: error→PagerDuty, warn→Slack, info→CloudWatch | `libs/logger/src/lib/logger.ts`                                  |
| HTTP access logs with 5xx errors at `error` level               | `libs/logger/src/lib/http-log.middleware.ts`                     |
| CloudWatch alarms: 5xx rate, p95 latency, DLQ depth             | `infra/lib/observability-stack.ts`                               |
| WAF access logs → CloudWatch log group + S3                     | `infra/lib/security-stack.ts`                                    |
| 30-day log retention (staging+)                                 | `infra/lib/observability-stack.ts`                               |
| Audit trail for every order state change                        | `apps/order-service/src/app/services/order.service.ts`           |
| CloudWatch Synthetics canary every 60s                          | `infra/lib/observability-stack.ts`                               |

### A10 — Server-Side Request Forgery (SSRF)

| Control                                                                 | Implementation                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------- |
| No user-controlled URL fetch in either service                          | architecture review                                       |
| All external calls use typed SDKs (AWS SDK, Axios) with fixed endpoints | `apps/notification-svc/src/app/consumers/sqs.consumer.ts` |
| VPC NACLs and security groups block unexpected egress                   | `infra/lib/network-stack.ts`                              |
| HTTP client has circuit breaker + timeout (5 s default)                 | `libs/http-client/src/`                                   |

---

## Consequences

- **Positive:** Full OWASP Top 10 coverage with traceable evidence.
- **Positive:** Each control is independently testable.
- **Negative:** Per-user rate limiter requires `trust proxy` to be set correctly
  behind ALB — misconfiguration bypasses rate limiting (documented in runbooks).
- **Trade-off:** bcrypt cost 12 adds ~250ms per login — acceptable for security;
  adjust to 10 in test environments.
