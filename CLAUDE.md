# CLAUDE.md — OrderFlow Engineering Standards

## IMPORTANT: Compaction Rules

When compacting, always preserve the full list of modified files,
current plan step count, and all security-critical rules in this file.

---

## Project Overview

**OrderFlow** — Real-Time Order Management System.
Nx monorepo with 2 Express microservices + Angular 18 frontend, deployed on AWS ECS Fargate.
Purpose: hands-on Fortune 500 SDLC patterns demonstration.

---

## Architecture

- **Pattern**: Microservices + Event-Driven (REST + async messaging)
- **Monorepo tool**: Nx 20 (use `nx affected` for incremental builds)
- **Cloud**: AWS (ECS Fargate, ALB, CloudFront, EventBridge, SQS, RDS, ElastiCache)
- **IaC**: AWS CDK (TypeScript) in `infra/` — 7 stacks
- **Message broker**: EventBridge (publish) → SQS (consume)
- **Environments**: Single `prod` environment (config in `infra/config/environments.ts`, per ADR-011)

### Services

| Service          | Port | Directory                |
| ---------------- | ---- | ------------------------ |
| order-service    | 3001 | `apps/order-service/`    |
| notification-svc | 3002 | `apps/notification-svc/` |
| web (Angular)    | 4200 | `apps/web/`              |

### Shared Libraries (always import from these, never duplicate)

| Import path                | Location              | Purpose                                              |
| -------------------------- | --------------------- | ---------------------------------------------------- |
| `@orderflow/shared-types`  | `libs/shared-types/`  | Domain models, DTOs, event interfaces                |
| `@orderflow/event-schemas` | `libs/event-schemas/` | Zod event validation + envelope builder              |
| `@orderflow/logger`        | `libs/logger/`        | Winston structured logger, PII masking, OTel tracing |
| `@orderflow/auth`          | `libs/auth/`          | JWT RS256 middleware, token generation               |
| `@orderflow/http-client`   | `libs/http-client/`   | Axios + circuit breaker + retry                      |
| `@orderflow/testing-utils` | `libs/testing-utils/` | Jest factories, mock builders, test app helper       |

---

## Language & Runtime Standards

- **Runtime**: Node.js 22 LTS (`.nvmrc` pinned)
- **Language**: TypeScript 5.5 — strict mode ON (see `tsconfig.base.json`)
  - `noImplicitAny: true`, `strictNullChecks: true`, `noUnusedLocals: true`
  - `no any` — use `unknown` + type guards instead
- **Backend**: Express 4.x with async/await — all handlers wrapped with `asyncHandler`
- **Validation**: Zod 3.x for all request/response schemas
- **ORM**: Prisma 5.x + PostgreSQL (schema at `apps/order-service/prisma/schema.prisma`)
- **Frontend**: Angular 18, NgRx Signal Store, TypeScript strict

---

## Code Standards

### IMPORTANT: Required for every PR

- ALL public methods and exported types require JSDoc
- Max function length: 30 lines — extract if longer
- Conventional Commits enforced: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- No direct commits to `main` — PRs only, minimum 1 approval
- Branch naming: `feature/TICKET-short-desc` | `fix/TICKET-desc` | `hotfix/desc`
- Update `CHANGELOG.md` before every commit

### Express middleware chain order (YOU MUST follow this)

```
helmet → cors (strictCors) → compression → rateLimit → auth → validate → handler → errorHandler
```

### Error handling

- Use `AppError` base class for domain errors — never `throw new Error()` in service layer
- All async Express handlers use `asyncHandler` wrapper — no uncaught rejections
- HTTP errors follow RFC 7807 Problem Details format
- Never expose stack traces in API responses (production)

### AWS SDK

- **YOU MUST use AWS SDK v3 only** (`@aws-sdk/client-*`)
- `aws-sdk` v2 is in `package.json` as a legacy dep — do NOT use it in new code
- Always configure retry: `{ maxAttempts: 3 }` on all AWS clients

### Logging

- Always use `@orderflow/logger` — never `console.log`
- Never log PII (email, password, token, card data) — PII masking is automatic in the logger
- Always include `correlationId` in log context

---

## Security Requirements

- OWASP Top 10 compliance — see `docs/adr/ADR-009-owasp-top10-mitigations.md`
- SOC 2 Type II controls mapped — see `docs/SOC2_CONTROLS.md`
- Secrets via AWS Secrets Manager only — never in `.env` files in production
- Zero-trust: no hardcoded credentials, no `*` in IAM Resource or Action
- PII handling per `docs/DATA_GOVERNANCE.md`
- All monetary values in cents (integer) — never float

---

## Testing Standards

- **Minimum coverage**: 80% unit (branches, functions, lines, statements)
- **Unit tests**: Jest + ts-jest, in `src/**/*.spec.ts` alongside source files
- **Integration tests**: Supertest + Testcontainers, in `test/integration/`
- **E2E tests**: Cypress in `apps/web-e2e/`
- **Load tests**: k6 scripts in `scripts/load-tests/k6/`
- Always use `@orderflow/testing-utils` factories — never hardcode test data
- Test naming: `should_[expectedBehavior]_when_[condition]`
- Run before commit: `npm test` (all) or `npm run test:affected` (changed only)

---

## CI/CD Pipelines (GitHub Actions)

| Workflow                | Trigger         | Purpose                                        |
| ----------------------- | --------------- | ---------------------------------------------- |
| `pr-checks.yml`         | Every PR        | Lint, format, unit tests, build, security scan |
| `integration-tests.yml` | PR to main      | Docker Compose + integration + contract tests  |
| `security-scan.yml`     | Daily + PR      | SAST, container scan, secret scan, Snyk        |
| `deploy-staging.yml`    | Merge to main   | Auto-deploy to staging ECS                     |
| `deploy-production.yml` | Manual dispatch | Canary deploy to prod with CAB gate            |
| `sbom.yml`              | Release         | SBOM generation + license compliance           |

---

## Local Development

```bash
# Start full local stack (PostgreSQL + Redis + LocalStack + services)
docker compose up -d

# Run order-service in dev mode
npm run dev -- --project=order-service

# Run all tests
npm test

# Run only affected tests (faster)
npm run test:affected

# CDK diff (always before cdk deploy)
npm run cdk:diff

# Lint all
npm run lint
```

**LocalStack** emulates: SQS, EventBridge, Secrets Manager (endpoint: `http://localhost:4566`)

---

## Git Workflow

```
main          ← production-ready, protected
  └── feature/TICKET-slug   ← your work branch
  └── fix/TICKET-slug       ← bug fix branch
  └── hotfix/critical-fix   ← emergency production fix
```

- Squash merge to main
- Delete branch after merge
- Tag releases: `v1.2.0` with release notes
- Signed commits required

---

## Known Technical Debt

- `aws-sdk` v2 still in `package.json` root dependencies — do NOT use in new code
- Route 53 / custom domain not provisioned — ALB serves HTTP only (TLS at CloudFront)
- Secrets rotation Lambda not wired in CDK yet (tracked in `docs/PRODUCTION_APP_MASTER_PLAN.md`)
- SSM Parameter Store migration not complete — some config still in ECS env vars
