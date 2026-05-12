# SOC 2 Type II Controls — OrderFlow

**Classification:** Confidential — Internal Use Only  
**Last Updated:** 2026-05-12  
**Owner:** Platform / Security Team  
**Review Cadence:** Quarterly

---

## Overview

This document maps OrderFlow's implemented technical controls to the SOC 2
Trust Services Criteria (TSC). It is used as evidence during access reviews,
audit periods, and pen-test scoping.

---

## CC1 — Control Environment

| Control ID | Description                           | Evidence                                   |
| ---------- | ------------------------------------- | ------------------------------------------ |
| CC1.1      | Code of conduct & values communicated | `CODE_OF_CONDUCT.md`                       |
| CC1.2      | Governance documents defined          | `CONTRIBUTING.md`, `DEFINITION_OF_DONE.md` |
| CC1.3      | Security policy published             | `SECURITY.md`                              |
| CC1.4      | Change management process documented  | `docs/CHANGE_MANAGEMENT_PROCESS.md`        |

---

## CC2 — Communication and Information

| Control ID | Description                             | Evidence                   |
| ---------- | --------------------------------------- | -------------------------- |
| CC2.1      | Internal security communication channel | GitHub Security Advisories |
| CC2.2      | Vulnerability disclosure SLA defined    | `SECURITY.md`              |
| CC2.3      | Data governance policy documented       | `docs/DATA_GOVERNANCE.md`  |

---

## CC3 — Risk Assessment

| Control ID | Description                                | Evidence                                                 |
| ---------- | ------------------------------------------ | -------------------------------------------------------- |
| CC3.1      | Threat model maintained                    | `docs/THREAT_MODEL.md`                                   |
| CC3.2      | OWASP Top 10 risk mapping with mitigations | `docs/adr/ADR-009-owasp-top10-mitigations.md`            |
| CC3.3      | Dependency vulnerability scanning          | `.github/workflows/security-scan.yml` (Snyk + npm audit) |
| CC3.4      | Container image scanning                   | `.github/workflows/security-scan.yml` (Trivy)            |

---

## CC4 — Monitoring Activities

| Control ID | Description                                 | Evidence                                                       |
| ---------- | ------------------------------------------- | -------------------------------------------------------------- |
| CC4.1      | Structured audit logs for all state changes | `OrderAudit` table — `apps/order-service/prisma/schema.prisma` |
| CC4.2      | Log retention policy enforced (30–90 days)  | `infra/lib/observability-stack.ts`                             |
| CC4.3      | CloudWatch alarms with PagerDuty escalation | `infra/lib/observability-stack.ts`                             |
| CC4.4      | Synthetic health monitoring (60 s interval) | `infra/lib/observability-stack.ts` (Synthetics canary)         |
| CC4.5      | WAF access logs captured                    | `infra/lib/security-stack.ts`                                  |
| CC4.6      | Error budget burn-rate alerting             | `infra/lib/observability-stack.ts`                             |

---

## CC5 — Logical and Physical Access Controls

| Control ID | Description                                        | Evidence                                               |
| ---------- | -------------------------------------------------- | ------------------------------------------------------ |
| CC5.1      | JWT RS256 authentication on all API endpoints      | `libs/auth/src/lib/`                                   |
| CC5.2      | IAM least-privilege roles per service              | `infra/lib/security-stack.ts`                          |
| CC5.3      | No long-lived AWS credentials in CI/CD (OIDC)      | `.github/workflows/deploy-staging.yml`                 |
| CC5.4      | Secrets Manager for all credentials (no plaintext) | `infra/lib/security-stack.ts`                          |
| CC5.5      | Secrets rotation policy (90 days) tagged           | `infra/lib/security-stack.ts` (RotationPolicyDays tag) |
| CC5.6      | Branch protection + signed commits required        | `.github/CODEOWNERS`, repository settings              |
| CC5.7      | CODEOWNERS review required for sensitive paths     | `.github/CODEOWNERS`                                   |

---

## CC6 — Logical Access Controls (System Boundaries)

| Control ID | Description                                                           | Evidence                                                            |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| CC6.1      | VPC with private subnets; services not internet-exposed               | `infra/lib/network-stack.ts`                                        |
| CC6.2      | Security groups — least-privilege, no `0.0.0.0/0` ingress on services | `infra/lib/network-stack.ts`                                        |
| CC6.3      | WAF rules: SQLi, XSS, Known Bad Inputs, rate limiting                 | `infra/lib/security-stack.ts`                                       |
| CC6.4      | RDS in isolated subnets, no public access                             | `infra/lib/database-stack.ts`                                       |
| CC6.5      | VPC Flow Logs enabled (staging+)                                      | `infra/config/environments.ts` (`enableVpcFlowLogs`)                |
| CC6.6      | Encryption in transit: TLS 1.2+ CloudFront, TLS Redis                 | `infra/lib/cdn-stack.ts`, `infra/lib/database-stack.ts`             |
| CC6.7      | Encryption at rest: RDS, S3, Redis, Secrets Manager                   | `infra/lib/database-stack.ts`, `infra/lib/cdn-stack.ts`             |
| CC6.8      | Container runs as non-root user                                       | `apps/order-service/Dockerfile`, `apps/notification-svc/Dockerfile` |

---

## CC7 — System Operations

| Control ID | Description                                | Evidence                                                              |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------- |
| CC7.1      | Health + readiness probes on all services  | `apps/order-service/src/app/routes/health.router.ts`                  |
| CC7.2      | Graceful shutdown (SIGTERM handling)       | `apps/order-service/src/main.ts`, `apps/notification-svc/src/main.ts` |
| CC7.3      | ECS circuit-breaker with auto-rollback     | `infra/lib/ecs-stack.ts`                                              |
| CC7.4      | Auto-rollback Lambda on error rate spike   | `infra/lib/rollback-stack.ts`                                         |
| CC7.5      | Dead Letter Queues for failed SQS messages | `infra/lib/event-stack.ts`                                            |
| CC7.6      | Multi-AZ RDS + Redis in production         | `infra/config/environments.ts` (`prod`)                               |
| CC7.7      | Disaster Recovery Plan documented          | `docs/DISASTER_RECOVERY_PLAN.md`                                      |

---

## CC8 — Change Management

| Control ID | Description                                     | Evidence                                  |
| ---------- | ----------------------------------------------- | ----------------------------------------- |
| CC8.1      | All changes via PR + 1-approval review          | Branch protection rules                   |
| CC8.2      | CI gates: lint, tests ≥80% coverage, build      | `.github/workflows/pr-checks.yml`         |
| CC8.3      | SAST (CodeQL + SonarQube) on every PR           | `.github/workflows/security-scan.yml`     |
| CC8.4      | CAB approval gate before production deploy      | `.github/workflows/deploy-production.yml` |
| CC8.5      | Canary deployment with 15-min monitoring window | `.github/workflows/deploy-production.yml` |
| CC8.6      | CHANGELOG maintained per release                | `CHANGELOG.md`                            |
| CC8.7      | SBOM generated per release (CycloneDX)          | `.github/workflows/sbom.yml`              |

---

## CC9 — Risk Mitigation

| Control ID | Description                                      | Evidence                                                                  |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| CC9.1      | PII auto-redacted from all logs                  | `libs/logger/src/lib/logger.ts`                                           |
| CC9.2      | Data classification headers on all responses     | `apps/order-service/src/app/middleware/data-classification.middleware.ts` |
| CC9.3      | GDPR right-to-deletion implemented               | `apps/order-service/src/app/services/auth.service.ts`                     |
| CC9.4      | Consent timestamp captured and persisted         | `apps/order-service/src/app/validation/auth.schemas.ts`, Prisma schema    |
| CC9.5      | Data retention policy enforced                   | `docs/DATA_GOVERNANCE.md`                                                 |
| CC9.6      | Error budget policy limiting deployment velocity | `docs/ERROR_BUDGET_POLICY.md`                                             |

---

## Simulated Quarterly Access Review Checklist

- [ ] Review IAM roles — remove unused policies
- [ ] Rotate JWT private key (manual CICD process)
- [ ] Verify Secrets Manager secret versions — delete versions older than 2 rotations
- [ ] Review CloudWatch alarm notification subscriptions — remove stale emails
- [ ] Confirm all services still using least-privilege security groups
- [ ] Validate CODEOWNERS is up to date with current team membership
- [ ] Review DLQ message count — investigate any non-zero values
- [ ] Audit `OrderAudit` table for anomalous state-change patterns

---

## Simulated Penetration Test Checklist

| Category          | Test                                         | Expected Result                            |
| ----------------- | -------------------------------------------- | ------------------------------------------ |
| Auth bypass       | Access `/v1/orders` without token            | 401 Unauthorized                           |
| Auth bypass       | Replay expired JWT                           | 401 Unauthorized                           |
| Auth bypass       | Modify JWT payload (tamper `sub`)            | 401 Unauthorized                           |
| IDOR              | Access another user's order by ID            | 404 Not Found                              |
| SQLi              | Send `'; DROP TABLE orders;--` as `itemName` | 422 Validation Error (Zod)                 |
| XSS               | Send `<script>alert(1)</script>` as `notes`  | Sanitized / stored as literal string       |
| Rate limiting     | Send 400 requests in 15 min from same user   | 429 Too Many Requests                      |
| Path traversal    | `GET /v1/orders/../../etc/passwd`            | 400 Bad Request (UUID validation)          |
| Oversized payload | POST body > 100 KB                           | 413 Payload Too Large                      |
| CORS bypass       | Origin: https://evil.com                     | No Access-Control-Allow-Origin in response |
| Clickjacking      | Load app in iframe                           | Blocked by X-Frame-Options: DENY           |
