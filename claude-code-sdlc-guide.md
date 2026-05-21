# Claude Code: Enterprise SDLC Automation Guide

### Fortune 500 Standards | AWS · Node.js · TypeScript · Express · Microservices · Event-Driven · AI-Driven Lifecycle

---

## Table of Contents

1. [Foundation: Enterprise Project Brain](#1-foundation-enterprise-project-brain)
2. [AI-DLC System Architecture](#2-ai-dlc-system-architecture)
3. [Phase 1 — Planning & Requirements](#3-phase-1--planning--requirements)
4. [Phase 2 — Architecture & Design](#4-phase-2--architecture--design)
5. [Phase 3 — Implementation (Microservices / Event-Driven / Monorepo)](#5-phase-3--implementation)
6. [Phase 4 — Testing Strategy](#6-phase-4--testing-strategy)
7. [Phase 5 — CI/CD Automation](#7-phase-5--cicd-automation)
8. [Phase 6 — Security & Compliance](#8-phase-6--security--compliance)
9. [Phase 7 — Observability & Incident Response](#9-phase-7--observability--incident-response)
10. [Multi-Agent Orchestration Patterns](#10-multi-agent-orchestration-patterns)
11. [Agent Roles, Lifecycle & Model Selection](#11-agent-roles-lifecycle--model-selection)
12. [Cost Measurement & Optimization](#12-cost-measurement--optimization)
13. [Governance, Guardrails & Audit Trail](#13-governance-guardrails--audit-trail)
14. [AI-DLC CLI Cheat-Sheet & Sample Files](#14-ai-dlc-cli-cheat-sheet--sample-files)
15. [Session & Context Management](#15-session--context-management)
16. [Hooks System Deep Dive](#16-hooks-system-deep-dive)
17. [Daily Automation & Headless Patterns](#17-daily-automation--headless-patterns)
18. [Risk & Reward Matrix](#18-risk--reward-matrix)
19. [Troubleshooting & Common Issues](#19-troubleshooting--common-issues)

---

## 1. Foundation: Enterprise Project Brain

Before any code is written, Claude Code must understand your organization's standards. The "project brain" is a set of files in your repo root that every Claude session loads automatically.

### Step 1.1 — Create the Master CLAUDE.md

Place this file at the repo root (or per-service root in a monorepo).

```markdown
# CLAUDE.md — [Your Company] Engineering Standards

## Architecture

- Pattern: Microservices (Event-Driven, REST + async messaging)
- Cloud Provider: AWS (ECS Fargate, Lambda, API Gateway, CDK)
- Service mesh: AWS App Mesh / AWS Cloud Map
- API gateway: AWS API Gateway (REST & HTTP APIs)
- Message broker: AWS SNS + SQS (primary), Amazon MSK (Kafka) for streaming
- Monorepo tool: Nx / Turborepo
- IaC: AWS CDK (TypeScript) + Terraform (shared infra)

## Language & Framework Standards

- Runtime: Node.js 20 LTS (Alpine-based containers)
- Language: TypeScript 5.x (strict mode enabled)
- Backend Framework: Express.js 4.x with ts-node / tsx for dev
- Validation: Zod (runtime schema validation) + express-validator
- ORM: Prisma (PostgreSQL) / DynamoDB Document Client (NoSQL)
- Frontend: React 18 + TypeScript 5 | Next.js 14
- Database: Amazon Aurora PostgreSQL 16 (primary), ElastiCache Redis 7 (cache), OpenSearch 2.x (search)
- Queues: SQS (task queues), SNS (fan-out), EventBridge (scheduled + event routing)

## Code Standards

- ALL public methods and exported types require JSDoc
- TypeScript strict mode: no `any`, no implicit returns, no unused vars
- Test coverage minimum: 80% unit, 60% integration (Jest + ts-jest)
- No direct commits to main/master — PRs only
- Conventional Commits format enforced (feat:, fix:, chore:, docs:)
- Zero-trust: never log PII, secrets, or credentials
- Express middleware chain: helmet → cors → rateLimit → auth → validate → handler
- All async Express handlers wrapped with asyncHandler utility (no uncaught rejections)
- AWS SDK v3 only — never use deprecated aws-sdk v2 package

## Security Requirements (Fortune 500 baseline)

- OWASP Top 10 compliance mandatory
- Secrets via AWS Secrets Manager + AWS Systems Manager Parameter Store only
- SCA scanning: Snyk / Dependabot on every PR
- SAST: SonarQube quality gate must pass (A rating)
- Container images: no HIGH/CRITICAL CVEs at merge

## Compliance

- SOC 2 Type II controls active
- PII handling per CCPA/GDPR policy in /docs/privacy-policy.md
- Change management: all prod changes via approved Change Request

## Git Workflow

- Branch naming: feature/JIRA-123-short-desc | fix/JIRA-456-desc
- PR template: /.github/pull_request_template.md
- Required reviewers: 2 (1 must be senior/staff)
- Merge strategy: Squash merge to main
```

### Step 1.2 — Create Service-Level CLAUDE.md (Monorepo)

For each service in `services/[service-name]/CLAUDE.md`:

```markdown
# CLAUDE.md — Payment Service

## Responsibility

Handles all payment processing, refunds, and reconciliation.
Owner team: payments-team@company.com

## Tech Stack

- Runtime: Node.js 20 + TypeScript 5.x + Express 4.x
- Database: Aurora PostgreSQL (via Prisma ORM)
- Cache: ElastiCache Redis (ioredis client)
- Queue: SQS (payment processing) + SNS (payment.events topic)
- Deploy: ECS Fargate (2 vCPU, 4GB RAM, min 3 replicas)

## Domain Rules

- Never charge a card without idempotency key (X-Idempotency-Key header)
- All monetary values in cents (integer), never float
- PCI-DSS scope: see /docs/pci-scope.md
- Use Stripe tokenization — never handle raw card data in our services

## External Dependencies

- Stripe API v3 (see /docs/stripe-integration.md)
- Internal: order-service (REST via API Gateway), notification-service (SNS topic: payment.events)
- AWS Services: Secrets Manager (API keys), KMS (encryption), CloudWatch (metrics)

## Local Dev

- `docker compose up` → starts LocalStack + PostgreSQL + Redis
- `npm run test` → full test suite (Jest)
- `npm run dev` → hot-reload dev server (tsx watch)
- `npm run test:integration` → integration tests with Testcontainers
```

### Step 1.3 — Create Architecture Decision Records (ADR) Index

```bash
# Ask Claude Code to scaffold your ADR structure
claude "Create an ADR directory structure following the Nygard format.
Include an index.md and template.md. Store at /docs/adr/"
```

### Step 1.4 — CLAUDE.md Operational Best Practices

The CLAUDE.md is **advisory, not enforced** — Claude may override rules during problem-solving. Design for this constraint:

**Rule Management:**

- Keep total rule count **under 50 per file** — compliance degrades past ~150 rules across all loaded files; middle-rule blindness causes rules buried in long files to be consistently ignored
- **Front-load critical rules** at the top of every CLAUDE.md — Claude attends to early rules more reliably
- Mark non-negotiable rules with `IMPORTANT` or `YOU MUST` for stronger adherence
- Use `@path/to/file` imports for modular sections — keep domain rules, security rules, and coding standards in separate files imported into the main CLAUDE.md

**Three-Level Hierarchy:**

```
~/.claude/CLAUDE.md              → Global rules (commit format, branch naming, test runner)
<project>/CLAUDE.md              → Project-specific (architecture, domain rules, local dev)
<project>/services/X/CLAUDE.md   → Service-scoped (loaded on-demand when Claude reads that directory)
```

**Compaction Protection:**

Add this to every project CLAUDE.md to survive mid-session `/compact`:

```markdown
## IMPORTANT: Compaction Rules

When compacting, always preserve the full list of modified files,
current plan step count, and all security-critical rules above.
```

**`.claudeignore` File:**

Place at project root to prevent Claude from reading irrelevant content (reduces accidental token waste):

```
node_modules/
dist/
build/
*.env
*.env.*
data/
*.sqlite
*.log
coverage/
.nx/cache/
.turbo/
.serverless/
cdk.out/
.terraform/
*.tfstate*
.localstack/
```

> **Enforcement rule:** Non-negotiable standards (no force-push, no secrets in logs) belong in **Hooks** (Section 16), not CLAUDE.md — hooks have a 100% execution guarantee while CLAUDE.md rules are advisory.

---

## 2. AI-DLC System Architecture

The **AI-Driven Development Lifecycle (AI-DLC)** is an autonomous, agent-driven pipeline that takes a Jira ticket all the way to a tested, deployable pull request — keeping engineers free for higher-value work.

### 2.1 — High-Level Pipeline

```
┌───────────────────────┐
│  Jira / Ticket System │  ← Story source
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   .cloud/ Manifest    │  (permissions, hooks, agent config)
└───────┬───────┬───────┘
        │       │
        ▼       ▼
┌───────────┐ ┌────────────────┐
│  Hooks    │ │  Permissions   │
│ (pre/post)│ │  (.yaml)       │
└───────┬───┘ └───────┬────────┘
        │             │
        ▼             ▼
┌─────────────────────────┐
│  Agents (LLM)           │
│  ├─ Design-Agent        │
│  ├─ Code-Agent          │
│  ├─ Test-Agent          │
│  ├─ Deploy-Agent        │
│  └─ Observe-Agent       │
└───────┬─────────────────┘
        │
        ▼
┌─────────────────────┐
│  Tools & Skills     │  (Git, Docker, Helm, …)
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐
│  MCP Server         │  (multi-conversation controller)
└─────────────────────┘
```

### 2.2 — Core Components

| Component        | Role                                                                                       | Location                              |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Agents**       | Lightweight LLM instances (Haiku / Sonnet / Opus) that load a model and a plan             | `agents/<name>/`                      |
| **Tools**        | Low-level scripts (`git`, `docker`, `helm`) exposed to agents via MCP                      | MCP server                            |
| **Hooks**        | Run before/after every tool invocation — security checks, token removal, post-validation   | `hooks/<agent>/pre.sh`, `post.sh`     |
| **Skills**       | Reusable sub-tasks (e.g., "create test file", "generate Dockerfile") callable by any agent | `skills/<name>/skill.md`              |
| **Permissions**  | Global rules — block env-var writes, force pushes, secret modifications                    | `.cloud/permissions.yaml`             |
| **Orchestrator** | Natural-language workflow definition that delegates to sub-agents sequentially             | `agents/orchestrator/instructions.md` |

> **Design principle:** Sub-agents run independently with **no inter-agent chatter** — each finishes before the next starts, ensuring deterministic pipeline progression.

### 2.3 — Hallucination Mitigation Strategy

| Technique                        | Description                                                                                | Benefit                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Small, single-purpose agents** | Each agent handles only one step (design, code, test, deploy)                              | Limits scope, reduces hallucination risk              |
| **Chunking**                     | Large data (entire repo) is broken into logical chunks (design doc, code file, test suite) | Provides relevant context only                        |
| **Specs enforcement**            | Every pipeline step has a formal spec that must be obeyed                                  | Deviations trigger agent restart with correct context |
| **Post-validation**              | CI tests and smoke-test agents verify the PR before merge                                  | Catch residual hallucinations                         |
| **Context-window cap**           | Conversation history summarized to keep windows ~30 k tokens                               | Prevents context drift                                |

---

## 3. Phase 1 — Planning & Requirements

### Step 3.0 — Interview Pattern (Requirements Elicitation)

Before generating any artifacts, use Claude as an interviewer to surface missing requirements, edge cases, and tradeoffs:

```bash
claude "I have a feature request: [paste raw stakeholder notes].

Interview me using questions. Ask about:
- Edge cases and failure modes
- Performance expectations (latency, throughput, concurrency)
- Security implications and data sensitivity
- Dependencies on other services
- Rollback and migration strategy
- Tradeoffs I haven't considered

Keep asking until you have enough context to write a complete spec.
Do not generate any documents yet — just gather requirements."
```

> **Why this matters:** Skipping requirements elicitation leads to over-engineered or wrong implementations. The interview pattern catches ambiguity before it becomes code. Follow this with Step 3.1 once requirements are clear.

### Step 3.1 — Feature Discovery to PRD

When a feature request arrives (JIRA ticket, Slack thread, email), feed it to Claude Code to generate a structured PRD.

```bash
# In Claude Code terminal
claude "I have this feature request:
[paste raw stakeholder notes / ticket description]

Generate a PRD with:
- Problem statement
- User stories (Given/When/Then format)
- Acceptance criteria (testable)
- Out of scope
- Dependencies on other services
- Non-functional requirements (SLA, throughput, latency targets)
- Security considerations
- Data model changes required

Output as /docs/features/FEATURE-NAME/PRD.md"
```

**Fortune 500 standard:** PRDs must have acceptance criteria that map 1:1 to test cases. Claude enforces this by generating them together.

### Step 3.2 — Requirements to Technical Design Document (TDD)

```bash
claude "Using /docs/features/FEATURE-NAME/PRD.md, generate a Technical Design Document.

Include:
- System context diagram (Mermaid) showing AWS services involved
- API contract (OpenAPI 3.1 YAML) with Express route mapping
- Database schema changes (Prisma migration scripts)
- Event schema (CloudEvents / AsyncAPI spec for SNS/SQS/EventBridge)
- Sequence diagrams for happy path + 3 error paths
- AWS resource requirements (ECS task size, RDS instance class, cache node type)
- Capacity estimate (RPS, storage growth, cache hit ratio, SQS throughput)
- Rollout strategy (feature flag via LaunchDarkly/AppConfig, CodeDeploy canary %)
- Rollback plan (ECS task definition rollback, DB migration revert)
- Cost estimate (monthly AWS cost delta for new resources)

Save as /docs/features/FEATURE-NAME/TDD.md"
```

### Step 3.3 — Task Decomposition

```bash
claude "Break down /docs/features/FEATURE-NAME/TDD.md into atomic engineering tasks.

Rules:
- Each task ≤ 4 hours of work
- Each task independently testable
- Include dependency ordering
- Tag each task: [backend|frontend|infra|data|security]
- Format as JIRA-compatible JSON

Output to /docs/features/FEATURE-NAME/tasks.json"
```

---

## 4. Phase 2 — Architecture & Design

### Step 3.1 — Microservices: Service Boundary Validation

```bash
claude "Review our current service map at /docs/architecture/services.yaml.

Analyze the proposed new service in /docs/features/FEATURE-NAME/TDD.md and:
1. Identify if this belongs in an existing service or needs a new one (apply DDD bounded context rules)
2. Check for data ownership violations (no service should read another's DB directly)
3. Flag any circular dependencies
4. Recommend the communication pattern:
   - Sync: REST via API Gateway (Express routes) for query/command requiring immediate response
   - Async: SNS/SQS for eventual consistency, fire-and-forget commands
   - Streaming: EventBridge for cross-domain events, MSK (Kafka) for high-throughput streams
5. Generate an updated services.yaml if a new service is needed"
```

### Step 3.2 — Event-Driven: Schema Registry Governance (AWS)

```bash
# Generate AsyncAPI spec for new events (SNS/SQS + EventBridge)
claude "For the payment.processed event in our AWS event infrastructure:

1. Generate an AsyncAPI 2.6 spec including:
   - CloudEvents envelope fields (id, source, type, time, datacontenttype)
   - Payload schema (JSON Schema draft-07)
   - EventBridge event pattern for routing rules
   - SNS message attributes for filtering
2. Generate the JSON Schema for EventBridge Schema Registry
3. Create a migration guide if this replaces an existing event
4. Write consumer contract tests (Pact) for SQS consumers
5. Generate TypeScript types from the schema (using json-schema-to-typescript)

Save to /schemas/events/payment/payment.processed.v2/"
```

### Step 3.3 — Monorepo: Dependency Graph Analysis

```bash
# For Nx monorepo
claude "Run `nx graph --file=output.json` and analyze the output.

Identify:
1. Services with too many dependents (blast radius > 5 = high risk)
2. Circular dependencies
3. Shared libraries that should be extracted to npm packages
4. Services that can be built in parallel (independent subgraph)

Generate a refactoring plan with priority order."
```

### Step 3.4 — API Contract-First Design

```bash
claude "Generate an OpenAPI 3.1 spec for the Payment API following our standards in CLAUDE.md.

Requirements from /docs/features/FEATURE-NAME/TDD.md.

Include:
- All endpoints with request/response schemas (TypeScript-friendly types)
- Error responses (RFC 7807 Problem Details format)
- Authentication: AWS Cognito JWT (Authorization header) + API Key (x-api-key via API Gateway)
- Rate limiting headers (X-RateLimit-*) enforced by API Gateway usage plans
- Pagination: cursor-based (not offset)
- Versioning: URI path (/v2/)
- Webhook events section (delivered via SNS → HTTPS subscription)
- Zod schema generation from OpenAPI (using openapi-zod-client)

Save to /services/payment-service/api/openapi.yaml"
```

---

## 5. Phase 3 — Implementation

### Step 4.1 — Service Scaffolding

```bash
# Scaffold a new Express + TypeScript microservice following company standards
claude "Scaffold a new Express microservice called 'notification-service' using TypeScript.

Follow standards in CLAUDE.md. Include:
- Project structure:
  src/
    domain/          (entities, value objects, domain events)
    application/     (use cases, DTOs, interfaces)
    infrastructure/  (repositories, AWS clients, external adapters)
    interfaces/      (Express routes, middleware, controllers)
    config/          (env validation with Zod, AWS config)
    shared/          (error classes, result types, utils)
  tests/
    unit/
    integration/
    e2e/
- Express app with:
  - TypeScript strict mode (tsconfig.json with strict: true)
  - Express Router pattern with controller/service/repository layers
  - Dependency injection via tsyringe or inversify
  - Request validation middleware using Zod schemas
  - Error handling middleware (centralized, RFC 7807 format)
  - Correlation ID middleware (X-Request-ID propagation)
  - Graceful shutdown handler (SIGTERM/SIGINT with connection draining)
- AWS integrations:
  - SQS consumer (polling with @aws-sdk/client-sqs)
  - SNS publisher (@aws-sdk/client-sns)
  - Secrets Manager config loader (@aws-sdk/client-secrets-manager)
  - X-Ray tracing (aws-xray-sdk + OpenTelemetry bridge)
- Health check endpoints (/health/live, /health/ready with dependency checks)
- Structured logging (Pino, JSON format, correlation-id in every log line)
- Docker:
  - docker-compose.yml with LocalStack, PostgreSQL, Redis
  - Dockerfile (multi-stage: build with node:20-alpine, run with node:20-alpine as non-root)
- .env.example with all required vars (AWS_REGION, DB_URL, REDIS_URL, etc.)
- package.json scripts: dev, test, test:integration, build, lint, format, start
- ESLint + Prettier config (@typescript-eslint, airbnb-base rules)
- Jest config (ts-jest, separate configs for unit vs integration)"
```

### Step 4.2 — Feature Implementation with TDD Loop

```bash
# Step 1: Write tests FIRST (Red phase)
claude "Using /docs/features/FEATURE-NAME/TDD.md and the acceptance criteria in PRD.md:

Write failing tests ONLY. Do not write implementation code yet.
- Unit tests for domain logic (pure functions, no mocks)
- Integration tests for use cases (mock AWS services with aws-sdk-client-mock)
- Contract tests for Express API endpoints (Supertest)
- Event contract tests (Pact) for SNS publishers / SQS consumers

Use Jest + ts-jest. Follow AAA pattern (Arrange/Act/Assert).
Name tests as: should_[expectedBehavior]_when_[condition]
Type all test fixtures with TypeScript interfaces."

# Step 2: Implement to make tests pass (Green phase)
claude "Now implement the minimum code to make all failing tests in
/services/payment-service/tests/ pass.

Do not add functionality not covered by a test.
Follow SOLID principles. Max function length: 20 lines.
Use dependency injection (tsyringe @injectable/@inject decorators).
All Express route handlers must be async with proper error forwarding.
Use Result<T, E> pattern for domain operations (no throwing in domain layer)."

# Step 3: Refactor (Refactor phase)
claude "All tests pass. Now refactor for clarity and maintainability.
- Extract magic numbers to named constants (src/shared/constants.ts)
- Add JSDoc to all public methods and exported types
- Check for duplication (DRY)
- Ensure error types are domain-specific (extend AppError base class)
- Ensure all AWS SDK calls have proper retry config and error handling
- Verify Zod schemas match OpenAPI spec
Tests must still pass after refactoring."
```

### Step 4.3 — Parallel Implementation with Git Worktrees (Multi-Agent)

For large features requiring parallel development:

```bash
# Create isolated worktrees for each agent
git worktree add ../payment-service-backend feature/JIRA-123-backend
git worktree add ../payment-service-frontend feature/JIRA-123-frontend
git worktree add ../payment-service-infra feature/JIRA-123-infra

# Terminal 1 — Backend agent
cd ../payment-service-backend
claude "Implement the backend tasks from /docs/features/FEATURE-NAME/tasks.json
tagged [backend]. API contract is at /services/payment-service/api/openapi.yaml.
Do not touch frontend or infra files."

# Terminal 2 — Frontend agent
cd ../payment-service-frontend
claude "Implement the frontend tasks from tasks.json tagged [frontend].
Consume the API at /services/payment-service/api/openapi.yaml (use MSW for mocks).
Do not touch backend or infra files."

# Terminal 3 — Infra agent
cd ../payment-service-infra
claude "Implement the infra tasks from tasks.json tagged [infra].
AWS CDK (TypeScript) for service-level infra. Terraform for shared/network infra.
Follow /infra/cdk/conventions.md and /infra/modules/conventions.md."
```

### Step 4.4 — Code Review Agent (Fresh Context)

```bash
# Always use a FRESH claude session for review
claude "You are a senior staff engineer at a Fortune 500 company.
Review the diff: $(git diff main...HEAD)

Check for:
1. Security issues (OWASP Top 10, injection, broken auth)
2. Adherence to CLAUDE.md standards
3. Missing error handling (all async code must have try/catch or Result type)
4. N+1 query problems
5. Missing input validation
6. PII being logged
7. Hardcoded secrets or config values
8. Missing tests for edge cases mentioned in TDD.md
9. Breaking changes to API contracts or event schemas
10. Performance issues (missing indexes, synchronous blocking calls)

Output as GitHub PR review comment format with line references."
```

---

## 6. Phase 4 — Testing Strategy

### Step 5.1 — Testing Pyramid Setup

```bash
claude "Set up a complete testing infrastructure for /services/payment-service following
the testing pyramid:

Layer 1 — Unit tests (Jest)
- Domain objects and business logic only
- No I/O, no network, no DB
- Target: 85% coverage on /domain/ and /application/ folders

Layer 2 — Integration tests (Jest + Testcontainers + LocalStack)
- Repository implementations with real PostgreSQL (Testcontainers)
- SQS/SNS with LocalStack (@testcontainers/localstack)
- Redis cache integration (Testcontainers)
- AWS SDK mocking with aws-sdk-client-mock for unit-level AWS tests
- Use @testcontainers/postgresql, @testcontainers/localstack

Layer 3 — Contract tests (Pact)
- Consumer-driven contracts for all downstream dependencies
- Provider verification in CI for all upstream services
- Store contracts in /contracts/ directory

Layer 4 — E2E tests (Playwright / Cypress for UI; k6 for API)
- Critical user journeys only (top 5 paths)
- Run against staging environment
- Max suite runtime: 10 minutes

Generate: jest.config.ts, jest.integration.config.ts, pact.config.ts,
test/setup.ts, test/teardown.ts"
```

### Step 5.2 — Automated Test Generation from OpenAPI

```bash
claude "Generate comprehensive API tests from /services/payment-service/api/openapi.yaml.

For every endpoint generate:
- Happy path test (200/201/204)
- Validation error tests (400) — one per required field
- Auth failure test (401)
- Authorization failure test (403)
- Not found test (404) where applicable
- Conflict test (409) where applicable
- Rate limit test (429)

Use Supertest. Group by endpoint. Include test data factories."
```

### Step 5.3 — Chaos & Resilience Testing

```bash
claude "Generate resilience test scenarios for the payment-service using the TDD at
/docs/features/FEATURE-NAME/TDD.md.

Scenarios:
1. Stripe API is down → verify circuit breaker opens after 5 failures (opossum library)
2. SQS/SNS unreachable → verify messages queue to DLQ and retry with exponential backoff
3. Aurora DB connection pool exhausted → verify graceful degradation + CloudWatch alarm fires
4. ECS task killed mid-transaction → verify idempotency key prevents double-charge
5. Network partition between payment-service and order-service → verify timeout + SQS compensation
6. ElastiCache Redis failover → verify cache-aside pattern falls back to DB
7. Secrets Manager throttled → verify cached secrets serve requests during outage

Generate: tests/chaos/ directory with k6 scripts and expected SLO assertions."
```

### Step 5.4 — Performance Testing Baseline

```bash
claude "Create a k6 performance test suite for /services/payment-service.

Scenarios:
- Baseline: 100 RPS sustained for 5 minutes
- Stress: ramp from 100 to 1000 RPS over 10 minutes
- Spike: jump to 2000 RPS for 30 seconds

SLO thresholds (fail the test if breached):
- p95 latency < 200ms
- p99 latency < 500ms
- Error rate < 0.1%
- Throughput > 950 RPS at 1000 RPS input

Save to /perf/payment-service.k6.js"
```

---

## 7. Phase 5 — CI/CD Automation

### Step 6.1 — Pipeline Architecture (GitHub Actions / GitLab CI)

```bash
claude "Generate a complete GitHub Actions CI/CD pipeline for a monorepo containing
Node.js/TypeScript Express microservices on AWS. It must meet Fortune 500 standards.

Pipeline stages:
1. change-detection — Nx affected analysis, only build changed services
2. lint-and-format — ESLint (@typescript-eslint), Prettier, tsc --noEmit type check
3. security-scan — Snyk SCA, Semgrep SAST, secret scanning (Gitleaks)
3b. llm-security-scan — Claude Code Security Review (see Step 7.4), fail on HIGH/CRITICAL
4. unit-test — parallel matrix per changed service (Jest + ts-jest), coverage report to Codecov
5. build — Docker multi-stage build (node:20-alpine), push to AWS ECR with commit SHA tag
6. integration-test — Testcontainers + LocalStack suite, Pact provider verification
7. sonarqube — Quality gate (A rating required), fail on new issues
8. container-scan — Trivy + AWS ECR image scanning (fail on HIGH/CRITICAL)
9. staging-deploy — AWS CDK deploy to staging ECS cluster, run smoke tests
10. e2e-test — Playwright/k6 against staging (via API Gateway endpoint)
11. approval-gate — Manual approval required for prod (CODEOWNERS enforcement)
12. prod-deploy — ECS blue/green deploy via AWS CodeDeploy, canary 5% → 25% → 100%
13. post-deploy — CloudWatch alarm triggers automated rollback if error rate > 1% for 5 min

Save to .github/workflows/ci-cd.yml
Also generate .github/workflows/pr-validation.yml (stages 1–4 only, runs on every PR)"
```

### Step 6.2 — Infrastructure as Code Automation

```bash
claude "Create AWS CDK stacks (TypeScript) and Terraform modules for the payment-service infrastructure.

AWS CDK Stacks (service-level, in /infra/cdk/payment-service/):
- PaymentServiceStack — ECS Fargate service + ALB target group + auto-scaling
- PaymentDatabaseStack — Aurora PostgreSQL Serverless v2, multi-AZ
- PaymentCacheStack — ElastiCache Redis cluster, encryption at rest + transit
- PaymentMessagingStack — SQS queues + SNS topics + DLQs + EventBridge rules
- PaymentSecretsStack — Secrets Manager secrets + rotation Lambda (Node.js)

Terraform Modules (shared infra, in /infra/terraform/modules/):
- /infra/terraform/modules/vpc/ — Multi-AZ VPC with private subnets
- /infra/terraform/modules/ecs-cluster/ — Shared ECS cluster + capacity providers
- /infra/terraform/modules/api-gateway/ — HTTP API Gateway with Cognito authorizer

Requirements:
- All resources tagged: Environment, Service, Team, CostCenter, DataClassification
- Encryption at rest on all storage resources (KMS CMK, not AWS managed)
- VPC-only, no public IPs on compute or data resources
- IAM roles follow least-privilege (no wildcards in Resource or Action)
- Enable VPC Flow Logs, CloudTrail, AWS Config Rules
- S3 access logging on all buckets
- CloudWatch Log Groups with 30-day retention (prod), 7-day (dev)
- WAF v2 on API Gateway (OWASP managed rules + rate limiting)
- Outputs used by application deployment pipeline
- CDK Nag enabled for security/compliance checks at synth time"
```

### Step 6.3 — GitOps with ArgoCD

```bash
claude "Generate ArgoCD Application manifests for the payment-service.

Structure:
- /gitops/apps/payment-service/
  - application.yaml (ArgoCD Application CR)
  - helm/
    - Chart.yaml
    - values.yaml (defaults)
    - values.staging.yaml (staging overrides)
    - values.prod.yaml (prod overrides)
    - templates/
      - deployment.yaml (with readiness/liveness probes, resource limits)
      - service.yaml
      - hpa.yaml (HPA: CPU > 70% → scale, min 3, max 20 replicas)
      - pdb.yaml (PodDisruptionBudget: maxUnavailable 1)
      - servicemonitor.yaml (Prometheus scrape config)
      - networkpolicy.yaml (default-deny, allow only necessary traffic)
      - rollout.yaml (Argo Rollouts canary strategy)

Follow Fortune 500 Kubernetes hardening: non-root containers,
read-only root filesystem, drop ALL capabilities, seccompProfile RuntimeDefault."
```

### Step 6.4 — Automated Database Migrations in CI/CD

```bash
claude "Implement a safe database migration pipeline using Prisma Migrate (TypeScript).

Steps:
1. Generate migration naming convention enforcer (prisma/migrations/{timestamp}_{description}/)
2. CI step: `prisma migrate diff` against production schema snapshot (dry-run validation)
3. Staging deploy: `prisma migrate deploy` before ECS service deployment
4. Production deploy: require migration pre-approval if alters > 1M rows
5. Generate rollback scripts for every migration (prisma db execute --file rollback.sql)
6. Detect and block: DROP TABLE, DROP COLUMN, NOT NULL without DEFAULT on existing column
7. Pre-migration: create RDS snapshot via AWS SDK before applying

Save migration scripts to /services/payment-service/prisma/migrations/
Save Prisma schema to /services/payment-service/prisma/schema.prisma"
```

---

## 8. Phase 6 — Security & Compliance

### Step 7.1 — OWASP Automated Security Review

```bash
claude "Perform a security review of /services/payment-service/src/ against OWASP Top 10.

Check each category (Express + TypeScript specific):
A01 Broken Access Control — verify all routes use auth middleware (Cognito JWT verification) + RBAC middleware
A02 Cryptographic Failures — verify no MD5/SHA1, all PII encrypted at rest (KMS), TLS 1.3 enforced
A03 Injection — verify all DB queries use Prisma (parameterized), no raw SQL; Zod validates all inputs
A04 Insecure Design — verify threat model exists for each sensitive flow
A05 Security Misconfiguration — check helmet middleware, CORS config, Express error handler hides stack traces
A06 Vulnerable Components — list all deps from package-lock.json, flag CVE score > 7.0
A07 Auth & Session — verify Cognito JWT expiry, refresh token rotation, token revocation via Cognito API
A08 Integrity Failures — verify dependency integrity (package-lock.json checksums, npm audit)
A09 Logging Failures — verify all auth events, data access, errors logged (Pino → CloudWatch)
A10 SSRF — verify all outbound HTTP calls use allowlist, no user-controlled URLs in axios/fetch

Output findings as SARIF format for GitHub Security tab import."
```

### Step 7.2 — Secrets & Credential Management

```bash
claude "Audit the entire codebase for secrets and implement AWS Secrets Manager integration.

Step 1: Run Gitleaks scan and report any findings
Step 2: Generate AWS Secrets Manager configuration:
  - Secret per service: /[env]/[service]/[secret-name]
  - IAM policies: least-privilege per ECS task role (only access own secrets)
  - Rotation Lambda (Node.js/TypeScript) for API keys and DB credentials
  - SecretString JSON structure with versioning
Step 3: Generate secrets loading module (src/config/secrets.ts):
  - Use @aws-sdk/client-secrets-manager with caching (aws-secretsmanager-caching)
  - Lazy load at startup, cache with TTL, auto-refresh
  - Type-safe secret interfaces (Zod validation on loaded secrets)
Step 4: Remove all .env files from git history using git-filter-repo
Step 5: Update docker-compose.yml to use LocalStack Secrets Manager for local dev
Step 6: Add pre-commit hook to block commits containing secret patterns
Step 7: Configure AWS Systems Manager Parameter Store for non-sensitive config
  - /[env]/[service]/config/* for feature flags, URLs, tuning params
  - Load via @aws-sdk/client-ssm at container startup"
```

### Step 7.3 — Compliance Documentation Generation

```bash
claude "Generate compliance artifacts for SOC 2 Type II audit.

For the payment-service, produce:
- Data Flow Diagram showing all PII data paths
- Control matrix mapping our controls to SOC 2 Trust Criteria (CC6, CC7, CC8, CC9)
- Evidence collection checklist (what logs/metrics satisfy each control)
- Change management log template
- Access review report template (quarterly)
- Incident response runbook template

Save to /docs/compliance/soc2/"
```

### Step 7.4 — LLM-Augmented Vulnerability Scanning in CI/CD

Enterprise security pipelines have historically relied on rule-based SAST (SonarQube, Semgrep), SCA (Snyk, Dependabot), and DAST (OWASP ZAP) tools. LLMs now add a **reasoning-based layer** that catches vulnerabilities these tools miss — business logic flaws, subtle race conditions, TOCTOU bugs, and cross-file data-flow exploits that defeat pattern-matching.

#### 7.4.1 — The LLM Security Landscape (Fortune 500 Interview Context)

| Model / Tool                          | Capability                                                                                            | Access Model                                                 | Best For                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Claude Mythos Preview**             | Zero-day discovery in OS kernels, browsers, and network stacks; autonomous exploit chain construction | Project Glasswing (restricted to critical industry partners) | Proactive zero-day hunting in high-value infrastructure                 |
| **Claude Code Security**              | AI-powered SAST using Opus; `/security-review` CLI command; GitHub Action for PR scanning             | Enterprise/Team plans; open-source GitHub Action             | CI/CD-integrated vulnerability scanning with false-positive filtering   |
| **Claude Opus 4.6 / 4.7**             | Found 500+ high-severity OSS vulnerabilities; traces cross-file data flows; proposes patches          | API / Claude Code CLI                                        | Deep security audits, architecture-level vulnerability analysis         |
| **Claude Sonnet**                     | OWASP Top 10 checks, secrets detection, input validation review                                       | API / Claude Code CLI                                        | Per-PR security gate in CI (cost-effective for high-volume scanning)    |
| **OpenAI GPT-5 / Codex**              | Code reasoning, vulnerability pattern detection, security review                                      | OpenAI API / GitHub Copilot                                  | Organizations already on Azure/OpenAI stack                             |
| **Google Gemini 2.5 Pro**             | Large context window (1M tokens), cross-repo analysis, security reasoning                             | Vertex AI / Gemini API                                       | Monorepo-wide scans where entire codebase fits in context               |
| **Meta Llama 3.x (open-weight)**      | Self-hosted security scanning, no data leaves the network                                             | Self-hosted (on-prem / private cloud)                        | Regulated industries (banking, healthcare) with data residency mandates |
| **Semgrep + LLM (Semgrep Assistant)** | Rule-based SAST augmented with LLM triage and remediation                                             | SaaS / self-hosted                                           | Teams wanting LLM augmentation without replacing existing SAST          |
| **DryRun Security**                   | Natural-language code policies + full-repo AI security review; works with agentic coding tools        | SaaS                                                         | Orgs using Copilot, Cursor, or Codex for agentic code generation        |

> **Key insight for interviews:** Claude Mythos Preview demonstrated that LLM cybersecurity capabilities are **emergent** — they were not explicitly trained. The same improvements in code reasoning that make models better at writing code make them better at finding (and exploiting) vulnerabilities. Anthropic's red team found Mythos Preview autonomously identified zero-days in every major OS and browser, including a 27-year-old bug in OpenBSD, a 17-year-old RCE in FreeBSD's NFS server (CVE-2026-4747), and a 16-year-old FFmpeg vulnerability that fuzzers hit 5 million times without catching.

> **Mythos by the numbers:** Previous models (Opus 4.6) had near-0% exploit success on Firefox; Mythos succeeded 181 times on the same benchmark. **N-day speed:** Mythos autonomously turns a CVE ID + git commit hash into a working exploit — work that took skilled researchers days to weeks. **Pricing:** $25/$125 per million input/output tokens (Project Glasswing partners); available on Claude API, AWS Bedrock, GCP Vertex AI, and Microsoft Foundry. **Anthropic commitment:** $100M in usage credits + $4M to open-source security foundations via Project Glasswing — a coalition including AWS, Microsoft, Google, Apple, Cisco, CrowdStrike, JPMorgan, NVIDIA, Palo Alto Networks, and the Linux Foundation.

#### 7.4.2 — Claude Code Security: Native CI/CD Integration

Anthropic ships a first-party GitHub Action ([`anthropics/claude-code-security-review`](https://github.com/anthropics/claude-code-security-review)) and a built-in `/security-review` slash command in Claude Code CLI.

**GitHub Actions Integration (recommended for Fortune 500 CI/CD):**

```yaml
# .github/workflows/llm-security-scan.yml
name: LLM Security Review

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  llm-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 2

      - name: Claude Code Security Scan
        uses: anthropics/claude-code-security-review@main
        with:
          comment-pr: true
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
```

**What it detects (beyond traditional SAST):**

- **Business logic flaws** — race conditions, TOCTOU, privilege escalation paths
- **Cross-file data-flow vulnerabilities** — traces tainted input across service boundaries
- **Authentication/authorization bypass** — broken auth logic, insecure direct object references
- **Cryptographic misuse** — weak algorithms, improper key management, insecure RNG
- **Supply chain risks** — typosquatting, vulnerable transitive dependencies
- **Code execution paths** — RCE via deserialization, pickle/eval injection, template injection

**Built-in false-positive filtering** automatically excludes low-impact findings (DoS, rate limiting, generic input validation without proven impact) to reduce noise.

**Local CLI usage (developer inner loop):**

```bash
# Run security review on pending changes before pushing
/security-review

# Or via headless mode in pre-push hook
claude -p "Run /security-review on $(git diff --name-only HEAD~1)"
```

#### 7.4.3 — Multi-Model Security Pipeline (Defense-in-Depth)

For Fortune 500 environments, layer LLM scanning alongside traditional tools:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PR Security Pipeline                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stage 1: Traditional (deterministic, zero false-negative)      │
│  ├─ Gitleaks → secret scanning                                  │
│  ├─ Snyk/Dependabot → SCA (known CVEs in dependencies)         │
│  ├─ Semgrep → pattern-based SAST rules                          │
│  └─ Trivy → container image CVE scan                            │
│                                                                 │
│  Stage 2: LLM-Augmented (reasoning-based, catches logic flaws) │
│  ├─ Claude Code Security (Opus) → cross-file semantic analysis  │
│  ├─ Custom Claude agent → OWASP Top 10 + domain-specific rules │
│  └─ Sonnet PR reviewer → business logic & auth bypass checks    │
│                                                                 │
│  Stage 3: Validation & Triage                                   │
│  ├─ Reachability analysis → is the vuln reachable in prod?      │
│  ├─ Exploitability scoring → CVSS + LLM context assessment      │
│  └─ Human review gate → security engineer approves/rejects      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**GitHub Actions implementation (full pipeline):**

```yaml
# .github/workflows/security-pipeline.yml
name: Multi-Layer Security Pipeline

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read
  security-events: write

jobs:
  # Stage 1: Traditional tools (fast, deterministic)
  traditional-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Gitleaks Secret Scan
        uses: gitleaks/gitleaks-action@v2
      - name: Snyk SCA
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      - name: Semgrep SAST
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/owasp-top-ten p/cwe-top-25

  # Stage 2: LLM-augmented scan (deep, semantic)
  llm-security-scan:
    runs-on: ubuntu-latest
    needs: traditional-scan
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 2

      - name: Claude Code Security Review
        uses: anthropics/claude-code-security-review@main
        with:
          comment-pr: true
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}

      - name: Custom Domain Security Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npm install -g @anthropic-ai/claude-code

          claude -p "
            You are a senior security engineer at a Fortune 500 company.
            Review the diff: $(git diff origin/main...HEAD)

            Apply these domain-specific security checks:
            1. PCI-DSS: No card data in logs, all payments via tokenization
            2. HIPAA: No PHI in plaintext, all health data encrypted at rest
            3. SOC 2: All auth events logged, all data access auditable
            4. OWASP Top 10 + CWE Top 25 compliance

            Output JSON: {
              findings: [{severity, category, file, line, description, remediation}],
              compliance_gaps: [{standard, control, gap, risk_level}],
              summary: string
            }
          " --output-format json > security-report.json

          # Fail pipeline on HIGH/CRITICAL findings
          HIGH_COUNT=$(jq '[.findings[] | select(.severity == "HIGH" or .severity == "CRITICAL")] | length' security-report.json)
          if [ "$HIGH_COUNT" -gt 0 ]; then
            echo "::error::$HIGH_COUNT HIGH/CRITICAL security findings detected"
            exit 1
          fi
```

#### 7.4.4 — Self-Hosted LLM Scanning (Air-Gapped / Regulated Environments)

For organizations where code **must not leave the corporate network** (banking, defense, healthcare):

```bash
# Option 1: Self-hosted Llama 3.x via vLLM
# Deploy on internal GPU cluster, no external API calls
docker run --gpus all -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model meta-llama/Meta-Llama-3.1-70B-Instruct

# Wrap with a security-scan prompt template
curl -X POST http://internal-llm:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Meta-Llama-3.1-70B-Instruct",
    "messages": [{"role": "user", "content": "Review this diff for security vulnerabilities following OWASP Top 10: '"$(git diff)"'"}]
  }'

# Option 2: AWS Bedrock (data stays in your VPC) — RECOMMENDED for Fortune 500
# Claude Opus/Sonnet via Bedrock — no data sent to Anthropic, runs in your AWS account
# Configure VPC endpoint for Bedrock to avoid public internet entirely
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-sonnet-4-20250514-v1:0 \
  --body '{"anthropic_version": "bedrock-2023-05-31", "messages": [{"role": "user", "content": "Security review: ..."}], "max_tokens": 4096}' \
  --region us-east-1 \
  --endpoint-url https://vpce-xxx.bedrock-runtime.us-east-1.vpce.amazonaws.com \
  output.json

# Option 3: Google Vertex AI (Claude models in GCP)
# Claude Mythos Preview available via Vertex AI (Project Glasswing partners)
```

#### 7.4.5 — LLM vs Traditional Security Tools: When to Use What

| Vulnerability Class                   | Traditional SAST | LLM-Augmented | Winner           |
| ------------------------------------- | ---------------- | ------------- | ---------------- |
| Known CVEs in dependencies (SCA)      | ✅ Excellent     | ⚠️ Redundant  | Traditional      |
| SQL injection (simple patterns)       | ✅ Good          | ✅ Good       | Tie              |
| Business logic flaws                  | ❌ Misses        | ✅ Catches    | **LLM**          |
| Race conditions / TOCTOU              | ❌ Misses        | ✅ Catches    | **LLM**          |
| Cross-file data flow exploits         | ⚠️ Limited       | ✅ Strong     | **LLM**          |
| Auth/authz bypass (subtle)            | ⚠️ Limited       | ✅ Strong     | **LLM**          |
| Hardcoded secrets                     | ✅ Excellent     | ✅ Good       | Traditional      |
| Container image CVEs                  | ✅ Excellent     | ❌ N/A        | Traditional      |
| Cryptographic misuse                  | ⚠️ Basic rules   | ✅ Contextual | **LLM**          |
| Zero-day discovery in C/C++ codebases | ❌ N/A           | ✅ Frontier   | **LLM (Mythos)** |

> **Interview talking point:** LLMs do not _replace_ SAST/SCA — they fill the gap traditional tools cannot cover. The optimal strategy is **defense-in-depth**: deterministic tools for known patterns + LLM reasoning for logic-level vulnerabilities. Anthropic's own recommendation is to use frontier models for all security tasks currently done manually, because "as models get better, the volume of security work is going to drastically increase."

#### 7.4.6 — Critical Caveats & Risk Mitigation

| Risk                                | Impact                                                            | Mitigation                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **False positives from LLM**        | Alert fatigue, wasted engineer time                               | Use Claude Code Security's built-in FP filtering; add reachability analysis as validation   |
| **Hallucinated vulnerabilities**    | False security confidence or unnecessary remediation              | Always validate LLM findings with runtime analysis (DAST) or manual review                  |
| **Model version drift**             | Behavior changes between model versions degrade detection quality | Pin model versions in CI; benchmark new versions against known vulnerability corpus         |
| **Prompt injection via PR content** | Attacker crafts PR diff to bypass LLM security review             | Run LLM scanner only on trusted PRs; use `Require approval for external contributors`       |
| **Code exfiltration via API**       | Sending proprietary code to external LLM API                      | Use AWS Bedrock / Vertex AI (data stays in VPC) or self-hosted Llama for regulated code     |
| **Cost at scale**                   | Opus-level scans on every PR can be expensive                     | Use Sonnet for routine PR scans; reserve Opus for release-candidate or high-risk-path scans |
| **Over-reliance on LLM findings**   | Skipping traditional tools because "AI handles it"                | LLM scanning is additive, not a replacement — keep Snyk, Semgrep, Trivy in the pipeline     |

#### 7.4.7 — Fortune 500 Interview: Key Talking Points

For tech interviews at Fortune 500 companies, these are the critical points to articulate:

1. **"LLM security scanning is reasoning-based, not rule-based"** — Unlike SAST which matches patterns, Claude traces data flows across files and understands business logic. This catches vulnerability classes that rule engines structurally cannot detect (race conditions, auth bypass, TOCTOU).

2. **"Mythos Preview represents an inflection point"** — Anthropic's red team showed it autonomously discovers and exploits zero-days in every major OS and browser. These capabilities emerged from general reasoning improvements, not explicit security training. This means every future frontier model will be better at both attacking and defending.

3. **"The defender advantage is a system, not a model"** — Discovery alone doesn't secure software. Fortune 500 security requires reachability analysis (is the vulnerability reachable in prod?), exploitability scoring, triage automation, and patch validation. The model is one component in a multi-layer pipeline.

4. **"Data residency dictates architecture"** — Regulated industries (finance: PCI-DSS, healthcare: HIPAA) often cannot send code to external APIs. The answer is AWS Bedrock (Claude in your VPC), Vertex AI, or self-hosted Llama — not "we can't use LLMs."

5. **"Cost optimization: tier your scanning"** — Use Haiku/Sonnet for routine PR checks ($0.003–$0.015/scan), Opus for release candidates and high-risk paths ($0.05–$0.15/scan), and reserve Mythos-class models for proactive zero-day hunting on critical infrastructure.

6. **"Patch cycles must shrink"** — Mythos Preview autonomously turned CVE identifiers + git commit hashes into working exploits. The window between CVE disclosure and mass exploitation is collapsing. Auto-update policies and same-day patching are becoming mandatory, not optional.

#### 7.4.8 — Custom Claude API Security Review (Programmatic Integration)

Beyond the first-party GitHub Action, teams can build custom security review integrations using the Anthropic SDK for deeper control over prompts, finding formats, and downstream automation:

```typescript
// claude-security-review.ts — Claude API for deep security review
// Uses Anthropic Claude to review PR diffs for security issues
// that rule-based SAST tools miss (context-dependent vulns)
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';

interface SecurityFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  cwe: string;
  file: string;
  line: number;
  attack_scenario: string;
  remediation: string;
}

interface SecurityReviewResult {
  status: 'PASS' | 'FAIL';
  findings: SecurityFinding[];
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const SECURITY_PROMPT = `You are a senior application security engineer
performing a code review. Analyze this TypeScript/Express code diff for:
- SQL/NoSQL injection (even with Prisma — check raw queries)
- XSS (especially in any SSR or template rendering)
- SSRF (axios/fetch calls with user-controlled URLs)
- Path traversal (fs operations, file uploads)
- Prototype pollution (Express body parsers, lodash merge)
- Insecure deserialization (JSON.parse of untrusted input without Zod)
- Broken authentication/authorization logic (Cognito JWT bypass)
- Mass assignment vulnerabilities (spreading req.body into Prisma)
- Unsafe regex (ReDoS in express-validator or custom validators)
- Missing rate limiting on sensitive endpoints
- Hardcoded secrets or AWS credentials
- Race conditions in async Express handlers (shared state)
- Missing input validation (routes without Zod middleware)
- Improper error handling (stack traces in API responses)

For each finding, provide:
1. Severity (CRITICAL/HIGH/MEDIUM/LOW)
2. CWE ID
3. Exact file and line reference
4. Why it's exploitable (attack scenario)
5. Concrete fix with TypeScript code

If no issues found, respond with {"status":"PASS","findings":[]}.
Respond in JSON format only.`;

/**
 * Fetches PR diff, sends to Claude for security review,
 * posts findings as inline PR comments.
 */
const reviewPRWithClaude = async (
  owner: string,
  repo: string,
  pullNumber: number
): Promise<SecurityReviewResult> => {
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const diffs = files
    .filter(f => f.filename.match(/\.(ts|tsx|js|mjs)$/))
    .map(f => `--- ${f.filename} ---\n${f.patch}`)
    .join('\n\n');

  if (!diffs) return { status: 'PASS', findings: [] };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: `${SECURITY_PROMPT}\n\n${diffs}` }],
  });

  const result: SecurityReviewResult = JSON.parse(
    response.content[0].type === 'text' ? response.content[0].text : '{}'
  );

  if (result.findings?.length > 0) {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: formatFindings(result.findings),
    });
  }

  return result;
};

const formatFindings = (findings: SecurityFinding[]): string => {
  const header = '## 🛡️ AI Security Review Findings\n\n';
  const rows = findings
    .map(
      f =>
        `### ${f.severity}: ${f.title}\n` +
        `- **CWE**: ${f.cwe}\n` +
        `- **File**: \`${f.file}:${f.line}\`\n` +
        `- **Attack**: ${f.attack_scenario}\n` +
        `- **Fix**: ${f.remediation}\n`
    )
    .join('\n');
  return header + rows;
};

export { reviewPRWithClaude, SecurityFinding, SecurityReviewResult };
```

**When to use this over the first-party Action:**

- Custom security prompts with domain-specific rules (PCI-DSS, HIPAA, SOX)
- Integration with internal ticketing systems (auto-create Jira security bugs)
- Custom finding format for SIEM/SOAR ingestion
- Chaining with other API calls (e.g., Snyk API enrichment)

### Step 7.5 — Claude Code Agent Security (Tool-Layer Threats)

Beyond application-level security, Claude Code itself introduces attack surfaces that must be mitigated:

**Permission Modes (enforce across all environments):**

| Mode                | Flag                                  | Behavior                                       | Use Case                             |
| ------------------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| `default`           | (none)                                | Prompts for approval on each tool action       | Normal interactive use               |
| `plan`              | `--permission-mode plan`              | Read-only, no writes/edits/commands            | Safe exploration, CI review jobs     |
| `autoAccept`        | `--permission-mode autoAccept`        | Auto-approves all tool calls without prompting | Trusted, well-scoped automation      |
| `bypassPermissions` | `--permission-mode bypassPermissions` | Skips all permission checks entirely           | **Dangerous** — never use unattended |

**Agent-Specific Threat Model:**

| Threat                           | Vector                                                                       | Mitigation                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Prompt injection**             | Malicious content in files, web fetches, or MCP responses hijacks Claude     | Sandbox untrusted content; never process external input without review                 |
| **Hook injection**               | Cloned repo `.claude/settings.json` embeds shell scripts running silently    | Audit every cloned project before running Claude Code                                  |
| **MCP config injection**         | Malicious `.mcp.json` connects to attacker-controlled servers                | Inspect `.mcp.json` in every cloned repo; only allowlist trusted servers               |
| **MCP chaining attack**          | Compromised MCP silently chains to other servers, leaking API keys           | Run only 3–6 active MCPs; enable Tool Search lazy loading                              |
| **Plugin supply chain**          | Third-party plugins bundle hooks + MCPs — no official vetting or sandboxing  | Use only first-party (Anthropic) or heavily audited community plugins                  |
| **Headless session hijacking**   | `claude -p` without `--permission-mode plan` executes with full write access | Always scope unattended sessions; use `plan` mode for CI review                        |
| **Browser automation injection** | Malicious page content injects instructions into Claude's context            | Never run Playwright sessions against untrusted URLs with sensitive credentials active |

**Pre-Clone Audit Checklist (mandatory for every new repository):**

```bash
# Before running Claude Code in ANY cloned repository, inspect:
# 1. .claude/settings.json — check for embedded hook scripts
# 2. .mcp.json — check for unfamiliar MCP server URLs
# 3. .claude/agents/ — read each agent's tools list (Bash = shell access)
# 4. .claudeignore — verify it excludes sensitive files
# 5. Any hooks/ directory in plugin bundles
```

**Tool Access Restrictions:**

Use `allowedTools` / `disallowedTools` in `.claude/settings.json` to restrict which tools Claude can use per-project:

```json
{
  "disallowedTools": ["Bash"],
  "allowedTools": ["Read", "Write", "Edit", "Grep", "Glob"]
}
```

Also available as CLI flags for per-invocation restrictions: `claude --disallowedTools Bash -p "review this code"`.

---

## 9. Phase 7 — Observability & Incident Response

### Step 8.1 — OpenTelemetry Instrumentation

```bash
claude "Instrument /services/payment-service with full observability (AWS-native + OpenTelemetry).

Implement:
1. Traces — AWS X-Ray + OpenTelemetry bridge
   - Auto-instrument Express HTTP, Prisma DB, SQS/SNS with @opentelemetry/auto-instrumentations-node
   - Configure aws-xray-sdk for X-Ray trace propagation
   - Add custom spans for domain events (payment.initiated, payment.authorized)
   - Propagate trace context across SQS messages (AWSTraceHeader + W3C TraceContext)
   - Export to AWS X-Ray (prod) and Jaeger via OTLP (local dev)
   - Add X-Ray segment annotations: service, environment, customerId

2. Metrics — CloudWatch EMF (Embedded Metric Format) + custom metrics
   - payment_processing_duration_seconds (histogram via EMF)
   - payment_success_total / payment_failure_total (counters, dimension: failure_reason)
   - payment_amount_cents (histogram, for revenue tracking)
   - sqs_messages_in_flight (gauge per queue)
   - sqs_dlq_message_count (gauge — alarm on > 0)
   - Export via aws-embedded-metrics npm package
   - Custom CloudWatch dashboard per service (CDK-generated)

3. Logs — structured JSON via Pino → CloudWatch Logs
   - Always include: trace_id, span_id, service, version, environment, requestId
   - Never include: card numbers, CVV, SSN, passwords
   - Use CloudWatch Logs Insights for querying
   - Export high-volume logs to S3 via Kinesis Firehose (retention/cost optimization)
   - Metric filters on CloudWatch Logs for error rate extraction

4. Alerting rules (CloudWatch Alarms + SNS → PagerDuty/Slack):
   - payment_failure_rate > 1% for 5min → SNS → PagerDuty P1
   - p99_latency > 1s for 3min → SNS → PagerDuty P2
   - sqs_dlq_message_count > 0 for 1min → SNS → Slack #payments-alerts
   - ECS task restart count > 3 in 10min → SNS → Slack #payments-alerts
   - 5xx error rate on ALB > 0.5% for 3min → SNS → PagerDuty P2
   - Generate CloudWatch Composite Alarms for SLO breaches"
```

### Step 8.2 — Automated Runbook Generation

```bash
claude "Generate operational runbooks for the payment-service.

For each alert in /infra/alerts/payment-service.yaml, create a runbook with:
1. Alert description and business impact
2. Triage steps (exact commands to run)
3. Common causes and diagnostic queries
4. Remediation steps (with rollback if needed)
5. Escalation path (L1 → L2 → L3 owner)
6. Post-incident review template

Format as Markdown. Link from alert annotations (runbook_url field).
Save to /docs/runbooks/payment-service/"
```

---

## 10. Multi-Agent Orchestration Patterns

### Pattern A — Reviewer/Implementer Split

```bash
# Agent 1: Implementer (writes code)
claude --session implementer "Implement task #4 from tasks.json.
Write tests first, then implementation. Do not proceed to task #5."

# Agent 2: Reviewer (fresh context, no implementation bias)
claude --session reviewer "Review the following diff without prior context:
$(git diff HEAD~1)
Apply the review checklist in /docs/review-checklist.md.
Block merge if any P0/P1 issues found."
```

### Pattern B — Orchestrator/Subagent Pattern

Create `.claude/agents/` directory with specialized agent definitions:

```markdown
# .claude/agents/security-agent.md

You are a security-focused engineer at a Fortune 500 company.
Your ONLY job is to identify security vulnerabilities.
Apply OWASP Top 10, CWE Top 25, and company policy in /docs/security-policy.md.
Never suggest implementation — only flag issues with severity and CVE references.
```

```markdown
# .claude/agents/architecture-agent.md

You are a principal architect.
Your ONLY job is to validate that changes align with the architecture in /docs/architecture/.
Check for: service boundary violations, anti-patterns, missing ADRs for significant changes.
Output findings as architecture review comments.
```

```markdown
# .claude/agents/qa-agent.md

You are a senior QA engineer.
Your ONLY job is to identify missing test coverage and generate additional test cases.
Reference acceptance criteria in /docs/features/ PRDs.
Output: list of missing test scenarios + generated test code.
```

**Orchestrator prompt:**

```bash
claude "You are the engineering lead orchestrating a PR review.

Delegate the following diff to the appropriate subagents:
$(git diff main...HEAD)

1. Invoke security-agent → collect findings
2. Invoke architecture-agent → collect findings
3. Invoke qa-agent → collect findings
4. Synthesize all findings into a PR review with:
   - APPROVED / REQUEST_CHANGES / BLOCKED decision
   - Summary table: [agent | severity | finding | recommendation]
   - Must-fix items (block merge) vs. nice-to-have (non-blocking)"
```

### Pattern C — Parallel Service Development (Monorepo)

```bash
#!/bin/bash
# parallel-implement.sh

FEATURE="JIRA-123-payment-refunds"
TASKS_FILE="docs/features/$FEATURE/tasks.json"

# Extract task groups
BACKEND_TASKS=$(jq '[.[] | select(.tag=="backend")]' $TASKS_FILE)
FRONTEND_TASKS=$(jq '[.[] | select(.tag=="frontend")]' $TASKS_FILE)
INFRA_TASKS=$(jq '[.[] | select(.tag=="infra")]' $TASKS_FILE)

# Create worktrees
git worktree add ../ws-backend feature/$FEATURE-backend
git worktree add ../ws-frontend feature/$FEATURE-frontend
git worktree add ../ws-infra feature/$FEATURE-infra

# Launch agents in parallel
(cd ../ws-backend && claude -p "Implement these tasks: $BACKEND_TASKS. Follow CLAUDE.md.") &
PID_BACKEND=$!

(cd ../ws-frontend && claude -p "Implement these tasks: $FRONTEND_TASKS. Follow CLAUDE.md.") &
PID_FRONTEND=$!

(cd ../ws-infra && claude -p "Implement these tasks: $INFRA_TASKS. Follow CLAUDE.md.") &
PID_INFRA=$!

wait $PID_BACKEND $PID_FRONTEND $PID_INFRA

echo "All agents complete. Merge worktrees and run integration tests."
```

### Pattern D — CI/CD Headless Mode (Automated)

```yaml
# .github/workflows/ai-pr-review.yml
name: Claude Code PR Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude Code Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npm install -g @anthropic-ai/claude-code

          DIFF=$(git diff origin/main...HEAD)

          claude -p "
            Review this PR diff against our standards in CLAUDE.md.
            Diff: $DIFF
            
            Output JSON: {
              decision: 'APPROVED' | 'CHANGES_REQUESTED',
              blocking_issues: [...],
              suggestions: [...],
              security_findings: [...]
            }
          " > review.json

          # Post review as PR comment
          gh pr comment ${{ github.event.pull_request.number }} \
            --body "$(cat review.json | jq -r '.summary')"
```

---

## 11. Agent Roles, Lifecycle & Model Selection

### 11.1 — Agent Role Map

| Role                    | Human Counterpart | Agent         | Primary Artifact              |
| ----------------------- | ----------------- | ------------- | ----------------------------- |
| **Design / Acceptance** | BA / UX Designer  | Design-Agent  | PRD, TDD, acceptance criteria |
| **Code Generation**     | Developer         | Code-Agent    | Feature branch, commit        |
| **Testing**             | QA Engineer       | Test-Agent    | Test suites, coverage report  |
| **CI/CD & Deployment**  | Release Engineer  | Deploy-Agent  | Helm release, pipeline run    |
| **Monitoring / Triage** | Support Engineer  | Observe-Agent | Runbooks, alert annotations   |

### 11.2 — Agent Creation Workflow

| Step                  | What Happens                                 | File / Command                              |
| --------------------- | -------------------------------------------- | ------------------------------------------- |
| **Create**            | Define purpose and auto-generate folder      | `cloud agents create "Dev Agent: code-gen"` |
| **Model Assignment**  | Choose Haiku / Sonnet / Opus                 | Edit `model.txt` or pass `--model` flag     |
| **Instruction File**  | Write natural-language goals and constraints | `agents/dev/instructions.md`                |
| **Plan File**         | Outline the high-level workflow steps        | `agents/dev/plan.md`                        |
| **Optional Hook**     | Add env-var checks, force-push guard         | `hooks/dev/pre.sh`                          |
| **Skill Integration** | Call reusable sub-skills in instructions     | `skills/generate_file/skill.md`             |
| **Run**               | Execute via orchestrator or directly         | `cloud agents run dev`                      |

### 11.3 — Model Selection & Automatic Routing

**Basic Selection:**

| Model      | Token Budget | Ideal Use                                  | Cost Profile |
| ---------- | ------------ | ------------------------------------------ | ------------ |
| **Haiku**  | 1 M tokens   | Small refactors, single-file changes       | Lowest       |
| **Sonnet** | 4 M tokens   | Multi-file changes, service scaffolding    | Medium       |
| **Opus**   | 8 M tokens   | Large feature builds, cross-service design | Highest      |

> **Rule of thumb:** Start with Haiku. Escalate to Sonnet when the change spans more than one file; escalate to Opus only for full-feature builds that require broad codebase context.

**Advanced: Automatic Model Routing via Subagents**

Instead of manually selecting models, create specialized subagents with different model overrides. Claude auto-selects the matching subagent based on its `description` field:

```markdown
# .claude/agents/quick-scan.md

---

name: quick-scan
description: Lightweight file scanning, pattern matching, grep-like searches, formatting checks
model: haiku
tools: Read, Grep, Glob

---

Scan files for the requested pattern. Output a concise summary. Do not modify any files.
```

```markdown
# .claude/agents/deep-reviewer.md

---

name: deep-reviewer
description: Security audits, architectural reviews, complex debugging, race condition analysis
model: opus
tools: Read, Grep, Glob, Bash

---

Perform a thorough review. Analyze for correctness, security vulnerabilities, edge cases.
Write findings to a review file.
```

```markdown
# .claude/agents/implementer.md

---

name: implementer
description: Feature implementation, refactoring, test writing, bug fixes, code generation
model: sonnet
tools: Read, Write, Edit, Grep, Glob, Bash

---

Implement the requested changes following existing code style and conventions.
```

**Routing behavior:**

- _"scan all files for hardcoded secrets"_ → Claude matches `quick-scan` (haiku)
- _"audit the auth module for security vulnerabilities"_ → Claude matches `deep-reviewer` (opus)
- _"implement the pagination feature"_ → Claude matches `implementer` (sonnet)

**Explicit Router Skill (when auto-matching is too fuzzy):**

```markdown
# .claude/commands/route.md

---

name: route
description: Classify task complexity and dispatch to the appropriate model-specialized subagent
allowed-tools: Agent, Read

---

Classify the user's task:

- **Tier 1 (Haiku):** File scanning, pattern search, formatting, simple lookups
- **Tier 2 (Sonnet):** Implementation, refactoring, test writing, bug fixes
- **Tier 3 (Opus):** Security audits, architecture decisions, complex debugging

Dispatch to: quick-scan, implementer, or deep-reviewer.
Always state which tier and model you selected before dispatching.
```

Invoke with: `/route <your task description>`

**Extended Model-to-Task Mapping:**

| Task Type                          | Model  | Rationale                                   |
| ---------------------------------- | ------ | ------------------------------------------- |
| File scanning, grep, formatting    | Haiku  | Fast, cheap, no reasoning needed            |
| Code generation, bug fixes, tests  | Sonnet | Good balance of quality and cost            |
| Refactoring, multi-file edits      | Sonnet | Sufficient reasoning for structured changes |
| Security audits, arch reviews      | Opus   | Deep reasoning catches subtle issues        |
| Complex debugging, race conditions | Opus   | Needs extended reasoning chains             |
| Commit messages, PR descriptions   | Haiku  | Templated output, low complexity            |
| Spec writing, design decisions     | Opus   | Requires weighing tradeoffs                 |
| Log scanning, health checks        | Haiku  | Pattern matching, no creativity needed      |

**Extended Thinking:** Claude Code supports extended thinking for complex reasoning tasks — Claude "thinks" longer before responding, improving output on architecture decisions, complex debugging, and multi-file refactors. Use selectively due to higher token cost per response.

### 11.4 — Orchestrator Configuration

```markdown
# agents/orchestrator/instructions.md

You are the engineering orchestrator.

Workflow (execute in order — do NOT start the next step until the previous finishes):

1. Invoke Design-Agent with the Jira ticket → produce PRD + TDD
2. Invoke Code-Agent with TDD → produce feature branch
3. Invoke Test-Agent with feature branch → produce passing test suite
4. Invoke Deploy-Agent → push to staging, run smoke tests
5. Invoke Observe-Agent → verify SLO dashboards are green

Context budget: keep each agent's context window below 30 k tokens.
Summarize earlier steps before invoking the next agent.
```

---

## 12. Cost Measurement & Optimization

### 12.1 — Per-Ticket Token Accounting

| Story Type  | Typical Token Cost      | Estimated $ Cost | $ / Story Point |
| ----------- | ----------------------- | ---------------- | --------------- |
| **Bug fix** | ~4–8 M tokens (Haiku)   | $6–$12           | $0.40–$0.80     |
| **Feature** | ~8–16 M tokens (Sonnet) | $15–$24          | $0.80–$1.20     |

> Costs are based on unified team subscriptions: **Azure OpenAI Premium** (~$300/mo) + **GitHub Copilot Premium** (~$20/mo). Actual per-ticket costs depend on model selection and chunk sizes.

### 12.2 — KMAN Token Counter Integration

Integrate a token counter (KMAN) into the agent lifecycle to enforce limits and produce cost reports:

```bash
# Wrap every agent run with token tracking
cloud agents run dev --token-budget 4000000 --cost-report ./reports/JIRA-123.json
```

The report output:

```json
{
  "story": "JIRA-123",
  "model": "sonnet",
  "total_tokens": 3_240_000,
  "estimated_cost_usd": 18.5,
  "story_points": 3,
  "cost_per_sp": 6.17
}
```

### 12.3 — Cost Optimization Loop

| Lever                  | Action                                                        | Expected Saving             |
| ---------------------- | ------------------------------------------------------------- | --------------------------- |
| **Model right-sizing** | Use Haiku for single-file refactors instead of Sonnet         | 60–70% per task             |
| **Context chunking**   | Feed only the relevant service folder, not the whole monorepo | 40–50% prompt reduction     |
| **Summarization**      | Compress prior conversation steps at 70% context utilization  | 30% window saving           |
| **Skill reuse**        | Replace repeated prompts with a callable skill                | Eliminates duplicate tokens |
| **Spec caching**       | Cache TDD + PRD as context prefix; reuse across agent runs    | Removes re-reading cost     |

### 12.4 — Validation & Feedback Loop Roadmap

| Current State                 | Planned Enhancement                                         |
| ----------------------------- | ----------------------------------------------------------- |
| CI tests as primary validator | Add Smoke-Test Agent for post-deploy sanity checks          |
| Rough token estimates         | KMAN strict per-story budget enforcement                    |
| Manual error logging          | Automated retry logic with exponential back-off             |
| No fact-checking              | Knowledge graph integration to verify outputs before commit |
| Manual context trimming       | Context-Window Optimizer to compress history automatically  |

### 12.5 — Token Efficiency Strategies

Beyond dollar cost, reducing token consumption directly improves Claude's reasoning quality (less noise in context) and extends Pro plan budgets.

**Prompt-Level Optimization:**

| Strategy               | Saving   | How                                                                      |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `@filename` references | Major    | Claude reads on demand instead of injecting file content inline          |
| Tight task scoping     | 30–50%   | _"check verifyUser in auth.js"_ not _"find the bug"_                     |
| Pipe data directly     | Variable | `cat error.log \| claude -p "find errors"` — avoids re-reading files     |
| Semantic code search   | ~98%     | Reduces ~150k tokens to ~2k by searching instead of reading entire files |

**Session-Level Optimization:**

- `/clear` between unrelated tasks — resets context window entirely
- `/compact <focus>` for targeted summarization mid-session (e.g., `/compact auth module changes`)
- Start fresh after 2 failed corrections — sunk-cost prompting wastes tokens
- **Prompt caching:** Claude Code automatically caches repeated context (CLAUDE.md, previously-read files) within a session — front-load key files early for cost efficiency

**MCP vs CLI Token Cost (Critical for Browser Automation):**

| Approach       | Tokens/Session | Output Destination | Best For                             |
| -------------- | -------------- | ------------------ | ------------------------------------ |
| Playwright MCP | ~114,000       | Inline (context)   | Stateful multi-step auth flows       |
| Playwright CLI | ~27,000        | Disk files         | Standard browser tasks (~4x cheaper) |

**Decision rule:** If the tool's output is consumed by the _agent_ for reasoning → MCP. If the output is consumed by _downstream code or files_ → CLI via Bash tool.

**CLI-over-MCP for common tools:**

| Tool Domain        | CLI Alternative   | MCP Server     | When to Use MCP Instead                               |
| ------------------ | ----------------- | -------------- | ----------------------------------------------------- |
| GitHub             | `gh` CLI          | GitHub MCP     | Complex multi-repo search, bulk operations            |
| Browser automation | Playwright CLI    | Playwright MCP | Stateful multi-step auth flows                        |
| Web fetching       | `curl` / `httpie` | Fetch MCP      | When Claude needs to reason over fetched content      |
| Git                | `git` CLI         | Git MCP        | Avoid — Git MCP has multiple reported vulnerabilities |
| Database           | `psql` CLI        | PostgreSQL MCP | Natural language → SQL translation (MCP adds value)   |

---

## 13. Governance, Guardrails & Audit Trail

### 13.0 — AI-DLC Security Guardrails Reference

The hook + permissions layer provides four defense-in-depth guardrails that apply to **every** agent tool invocation:

| Guardrail                     | Threat Blocked                                     | Implementation                                                                                |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Token Interception**        | PATs, OAuth tokens leaking into LLM prompt         | Pre-tool hook scans the prompt; any token string is removed before the LLM receives it        |
| **Destructive-Command Block** | Modifications to `*.env`, CI config, secrets files | Pre-tool hook rejects any such commands; agents can still run tests or deploy                 |
| **PII Masking**               | Personal data in code, docs, or logs sent to LLM   | Post-tool hook applies regex to scrub PII patterns before the response reaches the LLM        |
| **Global Permissions**        | Force pushes, env-var writes, secret modifications | Defined in `.cloud/permissions.yaml`; enforced by pre-/post-hooks and LLM "do-not" directives |

> **Result:** The LLM never receives raw secrets or PII, satisfying SOC 2, CCPA, and GDPR controls at the tool layer — not just at the application layer.

### Step 13.1 — Change Management Integration

```bash
claude "Generate a change management workflow integration.

When Claude Code proposes any of these high-risk changes:
- Database schema modification (ALTER/DROP)
- IAM policy changes
- Network security group changes
- Secrets rotation
- Production environment variable changes

Automatically:
1. Generate a Change Request document from /docs/templates/change-request.md
2. Estimate blast radius (list affected services)
3. Generate rollback steps
4. Require CODEOWNERS sign-off in PR before merge
5. Create JIRA ticket in CHANGE project via API

Implement as a pre-commit hook and GitHub Actions check."
```

### Step 13.2 — AI Output Audit Log

For Fortune 500 compliance, all Claude Code outputs must be auditable:

```bash
# Add to your shell profile / CI environment
export CLAUDE_AUDIT_LOG="/var/log/claude-code/audit.jsonl"

# Wrapper function
claude_audited() {
  SESSION_ID=$(uuidgen)
  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  USER=$(whoami)

  echo "{\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\",
         \"user\":\"$USER\",\"prompt\":\"$1\",\"repo\":\"$(git remote get-url origin)\"}" \
    >> $CLAUDE_AUDIT_LOG

  claude "$@"
}
```

### Step 13.3 — Context Window & Quality Guardrails

```bash
# Add to CLAUDE.md — enforced rules for every session

## Claude Code Guardrails

### NEVER do these without explicit human approval:
- Delete files or directories
- Run database migrations in production
- Modify IAM policies or security groups
- Commit directly to main/master
- Expose secrets in any output
- Make external API calls with production credentials

### ALWAYS do these:
- Run tests after any code change (make test)
- Validate linting before committing (make lint)
- Check for PII in any data you process
- Add correlation IDs to all log statements
- Confirm intent if the request is ambiguous

### Context management:
- At 70% context: summarize progress and /compact
- At 85% context: /clear and restart with summary
- Never proceed with degraded context on security-sensitive tasks
```

### Step 13.4 — Team Enablement & Rollout Plan

```
Week 1: Foundation
  □ Install Claude Code for all engineers (claude --version)
  □ Create master CLAUDE.md with team leads
  □ Train on: CLAUDE.md creation, basic prompting, review workflow

Week 2: Planning Automation
  □ Integrate PRD → TDD → Tasks pipeline into sprint planning
  □ Connect to JIRA via MCP server
  □ First sprint with AI-assisted estimation

Week 3: Implementation Workflow
  □ Establish TDD loop (tests first, implement, refactor)
  □ Set up git worktrees for parallel development
  □ Launch Code Review Agent on all new PRs

Week 4: CI/CD Integration
  □ Deploy ai-pr-review.yml GitHub Actions workflow
  □ Enable security scanning (Snyk + Semgrep)
  □ Instrument with OpenTelemetry

Month 2: Advanced Patterns
  □ Multi-agent orchestration for large features
  □ Chaos testing automation
  □ Full GitOps with ArgoCD
  □ Compliance artifact generation for SOC 2 audit

Month 3: Optimization
  □ Measure: PR cycle time, defect escape rate, DORA metrics
  □ Refine CLAUDE.md based on learnings
  □ Identify remaining manual toil for automation
```

---

## 14. AI-DLC CLI Cheat-Sheet & Sample Files

### 14.1 — AI-DLC Command Reference

| Command                                  | What It Does                   | Example                                                         |
| ---------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| `cloud agents create "NAME" "desc"`      | Create agent skeleton + folder | `cloud agents create "Dev" "Generate code"`                     |
| `cloud agents list`                      | List all registered agents     | `cloud agents list`                                             |
| `cloud agents run NAME`                  | Run a single agent             | `cloud agents run dev`                                          |
| `cloud agents run NAME --token-budget N` | Run with token cap             | `cloud agents run dev --token-budget 4000000`                   |
| `cloud orchestrator run`                 | Run full pipeline workflow     | `cloud orchestrator run`                                        |
| `cloud skills create "NAME" "desc"`      | Add a reusable skill           | `cloud skills create "generate_test_file" "Create a Jest test"` |
| `cloud hooks add NAME`                   | Add pre/post hooks to an agent | `cloud hooks add devops`                                        |
| `cloud env set KEY=VALUE`                | Set env var in .cloud context  | `cloud env set GIT_TOKEN=...`                                   |

### 14.2 — Sample Agent Instruction File

```markdown
# agents/dev/instructions.md

You are a code-generation assistant for AWS-based Node.js microservices.
Your job: turn a Jira description into production-ready TypeScript + Express code,
commit it, and push to the feature branch.

Constraints:

- Do not touch tests (Test-Agent handles those).
- Use TypeScript strict mode — no `any` types, no type assertions unless justified.
- All Express routes must use async handlers with proper error middleware forwarding.
- Use Zod for all request validation — never trust req.body/req.params directly.
- AWS SDK v3 only (@aws-sdk/\* packages) — never use aws-sdk v2.
- Avoid using deprecated APIs or Node.js built-ins (use node: prefix for core modules).
- Summarize changes in the commit message (Conventional Commits format).
- Follow all standards defined in CLAUDE.md.
```

### 14.3 — Sample Skill Definition

```markdown
# skills/generate_file/skill.md

Skill: Generate a file
Parameters:

- filename: str
- content: str
  Usage: create a new file under the repo and stage it for commit.
```

### 14.4 — Sample Security Hook

```bash
#!/usr/bin/env bash
# hooks/devops/pre.sh — block force pushes and env-file modifications

if grep -q "force=true" .git/config; then
  echo "ERROR: Force push is disabled by policy."
  exit 1
fi

if echo "$TOOL_ARGS" | grep -qE '\.env|secrets\.(yaml|json)'; then
  echo "ERROR: Modifications to env/secrets files require manual approval."
  exit 1
fi
```

### 14.5 — Sample Permissions File

```yaml
# .cloud/permissions.yaml

rules:
  - name: block-force-push
    action: deny
    pattern: 'git push --force*'

  - name: block-env-modification
    action: deny
    pattern: '*.env*'

  - name: block-secret-write
    action: deny
    pattern: 'secrets.*'

  - name: require-approval-prod
    action: require-human-approval
    pattern: 'kubectl * --namespace=production'
```

---

## 15. Session & Context Management

Effective session management is critical for multi-agent pipelines — a poorly managed context window leads to hallucinations, forgotten rules, and wasted tokens.

### 15.1 — Core Workflow Loop

The fundamental Claude Code workflow is a **4-phase loop:**

```
Explore (Plan Mode) → Plan → Implement → Commit
```

- **Plan Mode:** `Shift+Tab` or `claude --permission-mode plan` — read-only exploration without making changes
- **Commit** is always manual — Claude Code does not auto-commit; make this explicit in team workflows

### 15.2 — Session Lifecycle Commands

| Command / Action                     | Purpose                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| `/clear` (aliases: `/reset`, `/new`) | Reset context window entirely — use between unrelated tasks         |
| `/compact <focus>`                   | Targeted summarization (e.g., `/compact auth module changes`)       |
| `Esc`                                | Interrupt Claude mid-response; double-press to edit previous prompt |
| `/cost`                              | Show current session token usage and remaining budget               |
| `/doctor`                            | Diagnose Claude Code setup issues                                   |
| `/model`                             | Switch model mid-session without restarting                         |
| `/btw`                               | Ask side questions without affecting main task context              |
| `/rewind`                            | Rewind conversation to a previous point                             |

### 15.3 — Session Resumption (Multi-Session Workflows)

For features spanning multiple sessions (the norm in enterprise SDLC):

```bash
# Continue the most recent session (restores full conversation context)
claude --continue

# Resume a specific past session by ID
claude --resume <session-id>

# List past sessions
claude sessions list
```

**When to use what:**

- **`--continue` / `--resume`:** Continuing the same task — restores full conversation context including file reads and tool calls
- **Memory-based handoff:** Switching to a different aspect of the project — write a state summary, start fresh

### 15.4 — Context Window Guardrails

| Context Level | Action                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Normal        | Work normally; CLAUDE.md rules are active                              |
| ~70%          | Run `/compact <focus>` to summarize and free space                     |
| ~85%          | `/clear` and restart with a focused summary of what was accomplished   |
| After 2 fails | Start a fresh session with a refined prompt — stop correcting in-place |

> **Compaction risk:** `/compact` can erase CLAUDE.md rules and command details mid-session. Mitigate by adding the compaction preservation rule from Step 1.4.

### 15.5 — CLI Output Formats

For pipeline integration and machine-parseable outputs:

```bash
claude -p "..." --output-format text     # Plain text (default)
claude -p "..." --output-format json     # Machine-parseable JSON
claude -p "..." --output-format stream-json  # Streaming JSON for real-time processing
```

### 15.6 — Memory System (Cross-Session Persistence)

Persist project context across sessions to avoid re-explaining at the start of every session:

- **Location:** `~/.claude/projects/<project-hash>/memory/`
- **Structure:** Named `.md` files indexed by `MEMORY.md`; Claude loads `MEMORY.md` at session start and reads individual files on demand
- **What to store:** Project decisions, user preferences, feedback, external system pointers
- **What NOT to store:** Code patterns, git history, ephemeral task state — those belong in the codebase or commit messages

---

## 16. Hooks System Deep Dive

Hooks are the **enforcement layer** — they execute with 100% guarantee regardless of Claude's reasoning, unlike CLAUDE.md rules which are advisory.

### 16.1 — Hook Architecture

Hook scripts live in `.claude/hooks/` (per-project) or `~/.claude/hooks/` (global). They are registered in `.claude/settings.json` under a `hooks` key.

Each hook entry specifies:

- **`event`** — the trigger (see events table below)
- **`command`** — shell command or script path
- **`matcher`** (optional) — tool name filter for `PreToolUse`/`PostToolUse`
- **`timeout_ms`** (optional, default: 60000) — set to 0 for no timeout (⚠️ dangerous)

**Hook Input Payload:** Claude passes context via **stdin as a JSON object** containing `toolName`, `input`, and `toolInput` fields. Parse from stdin in your hook scripts — do not rely on specific shell environment variable names.

### 16.2 — Complete Hook Events Reference

| Event                | When                              | Use                                    |
| -------------------- | --------------------------------- | -------------------------------------- |
| `UserPromptSubmit`   | Before Claude processes prompt    | Inject context, validate input         |
| `PreToolUse`         | Before tool call executes         | Block writes to prod configs           |
| `PermissionRequest`  | When permission dialog appears    | Auto-approve/deny                      |
| `PostToolUse`        | After tool call succeeds          | Auto-format, run tests, audit          |
| `PostToolUseFailure` | After tool call fails             | Alert, retry logic                     |
| `PermissionDenied`   | When permission is denied         | Log denied actions, notify             |
| `SessionStart`       | New session begins                | Load env context, inject metadata      |
| `Setup`              | Initial setup/bootstrap           | Environment validation, install checks |
| `Stop`               | Agent finishes response           | Trigger CI, desktop notification       |
| `StopFailure`        | Agent response fails              | Error logging, alert, retry            |
| `Notification`       | Claude sends desktop notification | Redirect to Telegram/Slack             |
| `SubagentStart`      | Before subagent launches          | Log, scope-check                       |
| `SubagentStop`       | After subagent completes          | Aggregate results, alert               |
| `PreCompact`         | Before compaction runs            | Preserve critical context              |
| `SessionEnd`         | Session closes                    | Write session summary, cleanup         |
| `ConfigChange`       | Settings file modified            | Audit changes                          |
| `WorktreeCreate`     | Git worktree created              | Setup worktree-specific env            |
| `WorktreeRemove`     | Git worktree removed              | Cleanup                                |
| `TaskCompleted`      | Task marked complete              | Trigger downstream workflows           |

### 16.3 — Enterprise Hook Recipes

**Auto-run linter after every file write:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/eslint-fix.sh"
          }
        ]
      }
    ]
  }
}
```

**Block writes to migration folder:**

```bash
#!/usr/bin/env bash
# Pre-tool hook — exit code 2 blocks the action with explanation
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.toolInput.file_path // empty')
if [[ "$FILE" == *"/db/migrations/"* ]]; then
  echo "BLOCKED: Migration files require manual review." >&2
  exit 2
fi
```

**Auto-run tests on every file change (TDD loop):**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npm test --silent 2>&1 | tail -20"
          }
        ]
      }
    ]
  }
}
```

**Desktop/Telegram notification on session complete:**

```bash
#!/usr/bin/env bash
# Stop event hook — fires when Claude finishes a response
curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
  -d "chat_id=$CHAT_ID&text=Claude Code session complete"
```

### 16.4 — Hook Security Warnings

- ⚠️ **100% execution guarantee** — hooks fire regardless of Claude's reasoning; a blocking `PreToolUse` hook that hangs = Claude halts entirely
- ⚠️ **No rollback** — once a `PostToolUse` hook runs, destructive actions cannot be undone
- ⚠️ **Hook injection risk** — malicious repo `.claude/settings.json` can embed hook scripts running silently on your machine — audit before running any cloned project
- ⚠️ **Hooks are a second codebase** — they need versioning, testing, and debugging overhead

---

## 17. Daily Automation & Headless Patterns

Claude Code as a personal assistant and automated pipeline component — combining hooks, skills, MCP servers, and CLI tools into scheduled and on-demand workflows.

### 17.1 — Three Automation Tiers

| Tier         | Mechanism                             | Trigger                      | Best For                                 |
| ------------ | ------------------------------------- | ---------------------------- | ---------------------------------------- |
| On-demand    | Custom skill in `~/.claude/commands/` | Engineer types `/skill-name` | Standup, PR desc, context switch         |
| Event-driven | Hook in `~/.claude/settings.json`     | Claude Code activity         | Log digest, lint, notifications          |
| Scheduled    | macOS `launchd` plist or `crontab`    | Clock time                   | Health checks, dependency scans, digests |

### 17.2 — Headless Claude (Key Pattern)

```bash
# Non-interactive — returns output and exits
claude -p "<prompt>"

# Pipe data in directly
cat file.log | claude -p "find errors"

# Machine-parseable output
claude -p "<prompt>" --output-format json

# Read-only, safe for unattended use
claude --permission-mode plan -p "<prompt>"
```

> ⚠️ `claude -p` runs as your user with full filesystem permissions — always use `--permission-mode plan` for unattended runs unless writes are explicitly intended and scoped.

### 17.3 — Practical Automation Recipes

**Morning dev standup (on-demand skill `/standup`):**

```bash
claude -p "Using GitHub MCP: list my open PRs, issues assigned to me,
and any failed CI runs from the last 24h.
Format as a 10-line standup summary."
```

**Docker health check (scheduled via launchd, every 15 min):**

```bash
claude --permission-mode plan -p "Run: docker ps --format json.
If any container is stopped or restarting, output a one-line alert.
Otherwise output: all clear."
```

**PR description generator (on-demand skill `/pr-desc`):**

```bash
claude -p "git diff main...HEAD — write a PR description with:
summary bullet points, what changed, how to test. Output markdown."
```

**Cross-project context switch (on-demand skill `/switch-context`):**

```bash
claude -p "Read CLAUDE.md and last 5 git commits in this project.
Give me a 5-line summary of where things stand so I can resume quickly."
```

**Dependency vulnerability scan (scheduled, nightly):**

```bash
npm audit --json | claude -p "Summarize critical and high vulnerabilities.
List package name, severity, and recommended fix. Output markdown." \
  >> ~/notes/vuln-scan-$(date +%Y-%m-%d).md
```

**Log error digest (event-driven via Stop hook):**

```bash
#!/bin/bash
# ~/.claude/hooks/log-digest.sh — triggered on Stop event
tail -n 200 ~/project/logs/app.log \
  | claude -p "Extract unique error patterns, group by frequency,
  output as markdown table" >> ~/notes/error-digest.md
```

### 17.4 — Automation Best Practices

1. Always use `--permission-mode plan` for unattended/scheduled runs unless writes are explicitly needed
2. Pipe outputs to a review file first: `claude -p "..." > /tmp/review.md` — review before acting
3. Use `model: haiku` subagents for high-frequency tasks — preserves Pro window for active work
4. Never chain Claude output directly into deploy or push commands — always insert a human review gate
5. Store automation credentials in `~/.env.claude-automation` — never inline in cron strings
6. Scope each automation to one purpose per run — avoid "do everything" prompts
7. Add a `# last verified: YYYY-MM-DD` comment to each scheduled prompt — prompts rot as codebases change
8. Version-control your `~/.claude/commands/` automation skills alongside your dotfiles

---

## 18. Risk & Reward Matrix

A decision framework for evaluating which Claude Code features to enable in your pipeline:

### 18.1 — Feature Risk Assessment

| Feature                  | Token Cost           | Autonomy Boost | Security Risk | Maintenance |
| ------------------------ | -------------------- | -------------- | ------------- | ----------- |
| CLAUDE.md                | Low (static)         | Medium         | Low           | Low         |
| Hooks                    | None                 | High           | Very High     | Medium      |
| Skills (Commands)        | Low (on-demand)      | Medium         | Low           | Low         |
| MCP Servers              | Medium–High          | Very High      | Very High     | Medium      |
| Subagents                | High (per-agent)     | Very High      | Medium        | Low         |
| Plugins                  | High (bundled)       | Very High      | Very High     | High        |
| Browser Automation (MCP) | High (per action)    | High           | High          | Medium      |
| Browser Automation (CLI) | Low–Medium (to disk) | High           | Medium        | Low         |
| Daily Automation         | Low (headless)       | Very High      | Medium–High   | Medium      |

### 18.2 — Composition Strategies (High Autonomy at Low Cost)

No single feature achieves Very High autonomy + Low token cost + High accuracy simultaneously. The optimal approach is **layered composition**:

| Layer                                          | Role                             | Token Cost     | Accuracy Source                    |
| ---------------------------------------------- | -------------------------------- | -------------- | ---------------------------------- |
| Hooks                                          | Enforce rules deterministically  | None           | 100% execution guarantee           |
| CLAUDE.md                                      | Guide behavior, set constraints  | Low            | Front-loaded rules reduce drift    |
| Skills (`disable-model-invocation: true`)      | Deterministic scripted workflows | None (no LLM)  | Shell scripts don't hallucinate    |
| CLI tools (`gh`, `playwright-cli`, `git`)      | External tool access via Bash    | None–Low       | Deterministic CLI output           |
| Daily Automation (`claude -p` + narrow prompt) | Unattended scheduled runs        | Low (headless) | Narrow prompt = less error surface |

> **Principle:** Move deterministic logic out of the LLM into code. Every rule enforced via a Hook instead of CLAUDE.md is one that _cannot_ be ignored. Every workflow scripted via `disable-model-invocation` skill costs zero LLM tokens. Reserve LLM reasoning only for tasks that genuinely need it.

### 18.3 — Recommended MCP Server Set

Run only **3–6 active MCPs** at a time — beyond this, Claude confuses tools and context bloats at startup. Enable **Tool Search (lazy loading)** to reduce context usage up to 95%.

| Server     | Install                                                        | Type   | Best For                          |
| ---------- | -------------------------------------------------------------- | ------ | --------------------------------- |
| GitHub     | `claude mcp add @modelcontextprotocol/server-github`           | npm    | PRs, issues, repo search, CI/CD   |
| Context7   | `claude mcp add context7`                                      | npm    | Live version-specific API docs    |
| Playwright | `claude mcp add playwright`                                    | npm    | E2E testing, browser automation   |
| Supabase   | `claude mcp add --transport http https://mcp.supabase.com/mcp` | remote | DB, auth, storage, edge functions |
| Sentry     | `claude mcp add --transport http https://mcp.sentry.dev/mcp`   | remote | Stack traces, root cause analysis |
| PostgreSQL | `claude mcp add @modelcontextprotocol/server-postgres`         | npm    | Natural language DB queries       |
| Fetch MCP  | `claude mcp add fetch`                                         | npm    | Web content fetching              |

> ⚠️ Never set `enableAllProjectMcpServers: true`. Always audit `.mcp.json` in cloned repos before launching Claude Code.

---

## 19. Troubleshooting & Common Issues

### 19.1 — Startup & Configuration Issues

| Problem                                                     | Cause                                                       | Fix                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Claude Code starts but uses API credits instead of Pro plan | `ANTHROPIC_API_KEY` set in shell env                        | `unset ANTHROPIC_API_KEY` then run `/login`                                                            |
| Slow startup (>10s)                                         | Too many MCP servers loaded at init                         | Reduce to 3–6 active MCPs; enable Tool Search lazy loading                                             |
| MCP server fails to connect                                 | Package not installed, wrong URL, or server process crashed | Run `claude mcp list` to check status; reinstall with `claude mcp add <name>`                          |
| Hook script silently fails                                  | Script not executable, or error in script not surfaced      | Check `chmod +x` on hook script; add `set -e` and redirect stderr to a log file for debugging          |
| `/doctor` reports issues                                    | Misconfigured settings, missing dependencies                | Follow `/doctor` output recommendations; common fix is re-running `/login` or reinstalling MCP servers |

### 19.2 — Session & Context Issues

| Problem                                        | Cause                                      | Fix                                                                                   |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Claude ignores CLAUDE.md rules mid-session     | Compaction erased instructions             | Add compaction preservation rule (Step 1.4); use `/compact` with a focused topic      |
| Claude loads wrong custom command              | Vague `description` in command frontmatter | Make descriptions precise and unique; avoid generic keywords                          |
| Claude forgets prior context in long session   | Context window approaching limit           | Run `/compact <focus>` or start a fresh session with `/clear`                         |
| Claude over-engineers or rewrites working code | Task scope too broad                       | Scope prompts to specific files/functions; use Plan Mode first                        |
| Model falls back unexpectedly                  | Pro window exhausted                       | Check with `/cost`; wait for window reset or enable "Extra Usage" in account settings |

### 19.3 — Tool & Automation Issues

| Problem                                 | Cause                                     | Fix                                                                                  |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `claude -p` in cron produces no output  | Missing env vars, wrong working directory | Source `~/.env.claude-automation` in the launchd plist; specify full paths           |
| Playwright MCP actions are slow/timeout | Page load times exceed defaults           | Set explicit `timeout` in `playwright.config.ts`; use `fetch` MCP for static content |
| Subagent produces broken output         | Task too broad or chained without review  | Scope subagent to one specific task; always review output before chaining            |
| Git worktree conflicts at merge time    | Parallel agents edited overlapping files  | Assign each agent to distinct modules; review diffs before merging                   |

### 19.4 — Debugging Flags

```bash
claude --verbose       # Verbose logging for diagnosing startup and tool issues
claude /doctor         # Built-in diagnostic for configuration issues
claude /cost           # Check current session token usage and remaining budget
```

---

## Quick Reference Card

| SDLC Phase   | Claude Code / AI-DLC Command                | Fortune 500 Gate           | AWS Services                       |
| ------------ | ------------------------------------------- | -------------------------- | ---------------------------------- |
| Planning     | Interview pattern → `claude "Generate PRD"` | PM + Arch sign-off         | Jira + Confluence                  |
| Design       | `claude "Generate TDD + OpenAPI from PRD"`  | Architecture review        | API Gateway, EventBridge schemas   |
| Implement    | TDD loop: tests → code → refactor           | 2 reviewer PR approval     | Express + TypeScript + Prisma      |
| Review       | Fresh session review agent                  | CODEOWNERS + security scan | GitHub Actions                     |
| Test         | `claude "Generate tests from openapi.yaml"` | 80% coverage gate          | LocalStack + Testcontainers        |
| LLM Security | Claude Code Security + `/security-review`   | LLM scan: 0 HIGH/CRIT      | Bedrock (Claude in VPC)            |
| Build        | Nx affected + Docker multi-stage            | Trivy + ECR scan: 0 HIGH   | ECR, CodeBuild                     |
| Deploy       | `cloud orchestrator run` → CDK deploy       | Change Request approved    | ECS Fargate, CodeDeploy, CDK       |
| Monitor      | X-Ray traces + CloudWatch alarms            | SLO dashboard green        | X-Ray, CloudWatch, SNS → PagerDuty |
| Compliance   | `claude "Generate SOC2 evidence"`           | Annual audit review        | Config Rules, CloudTrail           |
| Cost Review  | `cloud agents run --cost-report`            | $/SP within budget target  | Cost Explorer, Budgets             |
| Session Mgmt | `/clear`, `/compact`, `--continue`          | Context window guardrails  | —                                  |
| Hooks        | Pre/Post tool enforcement                   | Audit all cloned repos     | —                                  |
| Automation   | `claude -p` + `--permission-mode plan`      | Human review gate          | EventBridge Scheduler              |

---

_Guide version: 2026-Q2 | Maintained by: Platform Engineering_
_Stack: AWS · Node.js 20 · TypeScript 5.x · Express 4.x · Prisma · ECS Fargate_
_Review cycle: Quarterly | Owner: platform-team@company.com_
_AI-DLC sections sourced from the Unified AI-DLC Overview (May 2026)_
_Sections 15–19 enhanced from Claude Code Complete Guide design spec (March 2026)_
_Section 7.4 (LLM-Augmented Vulnerability Scanning) added May 2026 — covers Claude Mythos, Claude Code Security, multi-model CI/CD pipelines_
_Aligned to Fortune 500 AWS + TypeScript + Express microservices pattern (May 2026)_
