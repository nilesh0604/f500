# CLAUDE.md — Vyasa Intelligence Engineering Standards

## IMPORTANT: Compaction Rules

When compacting, always preserve the full list of modified files,
current plan step count, and all security-critical rules in this file.

---

## Project Overview

**OrderFlow** — Real-Time Order Management System + **Vyasa Intelligence** — Agentic RAG Service.
Nx monorepo deployed on AWS (ECS Fargate for OrderFlow, Lambda + Bedrock for Vyasa).
Purpose: hands-on Fortune 500 SDLC patterns demonstration.

---

## Jira Integration

- **Site**: `nilesh0604.atlassian.net`
- **Project key**: `SCRUM`
- **Project name**: Vyasa Intelligence
- **Board type**: Software (next-gen / Team-managed)
- **Default JQL prefix**: `project = SCRUM`

When creating/searching issues, always use project key `SCRUM` unless explicitly told otherwise.

---

## Architecture

- **Pattern**: Microservices + Event-Driven (REST + async messaging)
- **Monorepo tool**: Nx 20 (use `nx affected` for incremental builds)
- **Cloud**: AWS (Lambda, Bedrock, API Gateway, CloudFront, S3 Vectors, DynamoDB, ECS Fargate, ALB, EventBridge, SQS, RDS, ElastiCache)
- **IaC**: AWS CDK (TypeScript) in `infra/`
- **Message broker**: EventBridge (publish) → SQS (consume)
- **Environments**: Single `prod` environment in `us-east-1` (config in `infra/config/environments.ts`, per ADR-011)

> **IMPORTANT — Single prod environment, existing resources only:**
> One environment (`prod`) in `us-east-1`. Stack names carry a `-dev-` prefix — this is a historical naming artifact; they ARE the prod resources.
> **Never create new AWS resources for this project.** Always reuse existing stacks, buckets, tables, Lambda, and Bedrock assets. See `docs/INFRASTRUCTURE.md` for the full resource inventory.

### Services (active)

| Service           | Runtime          | Directory                 | Status                                                                              |
| ----------------- | ---------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| vyasa-rag-service | Lambda + Bedrock | `apps/vyasa-rag-service/` | ✅ Live — Lambda `vyasa-rag-dev`, API Gateway `lkbzhoe1pj` in `us-east-1`           |
| vyasa-ui          | React 18 + Vite  | `apps/vyasa-ui/`          | ✅ Live — CloudFront `d2j5xbveesoc8s` (dist `E1W56P4E23UU5Y`) / `vyasa.nshinde.xyz` |

### Services (planned — not yet scaffolded)

| Service          | Runtime          | Directory                | Notes                                |
| ---------------- | ---------------- | ------------------------ | ------------------------------------ |
| order-service    | Express + Prisma | `apps/order-service/`    | Orders CRUD, EventBridge, PostgreSQL |
| notification-svc | Express + SQS    | `apps/notification-svc/` | SQS consumer, Socket.IO WebSocket    |
| web (Angular)    | Angular 18       | `apps/web/`              | NgRx Signal Store, 3 screens         |

### Shared Libraries (always import from these, never duplicate)

| Import path                | Location              | Status    | Purpose                                              |
| -------------------------- | --------------------- | --------- | ---------------------------------------------------- |
| `@orderflow/shared-types`  | `libs/shared-types/`  | ✅ exists | Domain models, DTOs, RAG types, event interfaces     |
| `@orderflow/testing-utils` | `libs/testing-utils/` | ✅ exists | Jest factories, mock builders, test app helper       |
| `@orderflow/event-schemas` | `libs/event-schemas/` | planned   | Zod event validation + envelope builder              |
| `@orderflow/logger`        | `libs/logger/`        | planned   | Winston structured logger, PII masking, OTel tracing |
| `@orderflow/auth`          | `libs/auth/`          | planned   | JWT RS256 middleware, token generation               |
| `@orderflow/http-client`   | `libs/http-client/`   | planned   | Axios + circuit breaker + retry                      |

---

## Language & Runtime Standards

- **Runtime**: Node.js 22 LTS (`.nvmrc` pinned)
- **Language**: TypeScript 5.5 — strict mode ON (see `tsconfig.base.json`)
  - `noImplicitAny: true`, `strictNullChecks: true`, `noUnusedLocals: true`
  - `no any` — use `unknown` + type guards instead
- **Backend (OrderFlow)**: Express 4.x with async/await — all handlers wrapped with `asyncHandler`
- **Backend (Vyasa)**: AWS Lambda + Bedrock KB + Amazon Nova Pro — ReAct agent loop
- **Validation**: Zod 3.x for all request/response schemas
- **ORM**: Prisma 5.x + PostgreSQL (planned — for `order-service` when scaffolded)
- **Frontend (Vyasa)**: React 18, Vite, TailwindCSS, Lucide icons — `apps/vyasa-ui/`
- **Frontend (OrderFlow)**: Angular 18, NgRx Signal Store (planned — `apps/web/`)

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

| Workflow                | Trigger       | Purpose                                                |
| ----------------------- | ------------- | ------------------------------------------------------ |
| `pr-checks.yml`         | Every PR      | Lint, format, unit tests, build, stylelint, Lighthouse |
| `security-scan.yml`     | Daily + PR    | SAST, container scan, secret scan, Snyk                |
| `llm-security-scan.yml` | Every PR      | Claude Sonnet via Bedrock — OWASP review of TS diff    |
| `vyasa-rag-ci.yml`      | PR + push     | Lint, test, build, CDK synth for Vyasa RAG             |
| `vyasa-rag-cd.yml`      | Push to main  | Deploy Lambda + API GW, smoke tests                    |
| `vyasa-rag-eval.yml`    | Daily 2am UTC | Golden dataset evaluation, Slack alert < 70%           |
| `vyasa-ui-cd.yml`       | Push to main  | Build + S3 sync + CloudFront invalidation              |
| `sbom.yml`              | Release       | SBOM generation + license compliance                   |

---

## Local Development

```bash
# Run all tests
npm test

# Run only affected tests (faster)
npm run test:affected

# CDK diff (always before cdk deploy)
npm run cdk:diff

# Lint all
npm run lint

# --- Vyasa RAG Service ---
npx nx build vyasa-rag-service   # Build Lambda bundle
npx nx test vyasa-rag-service    # Unit tests

# --- Vyasa UI ---
cd apps/vyasa-ui && npm run dev  # Dev server on port 4201
cd apps/vyasa-ui && npm run build # Production build

# --- OrderFlow (when scaffolded) ---
# docker compose up -d            # PostgreSQL + Redis + LocalStack
# npm run dev -- --project=order-service
```

**Vyasa UI proxy**: Vite proxies `/api` → `VITE_VYASA_API_URL` (default `http://localhost:3000`)

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
- Route 53 / custom domain not provisioned for OrderFlow — Vyasa uses `vyasa.nshinde.xyz` (Namecheap CNAME) / `d2j5xbveesoc8s.cloudfront.net` (direct CloudFront)
- Secrets rotation Lambda not wired in CDK yet (tracked in `docs/PRODUCTION_APP_MASTER_PLAN.md`)
- SSM Parameter Store migration not complete — some config still in ECS env vars
- `apps/vyasa-rag-service/CLAUDE.md` still says "Claude 3 Haiku" in diagram — actual model is Amazon Nova Pro
- OrderFlow services (`order-service`, `notification-svc`, `web`) not yet scaffolded — CLAUDE.md, agents, and skills reference them but they don't exist yet
- `@orderflow/logger` referenced in code standards but lib not yet created — Vyasa uses its own `src/lib/logger.ts`
