# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 4: CI Pipeline — GitHub Actions (Weeks 6–7)
  - `.github/workflows/pr-checks.yml`: Comprehensive PR validation workflow
    - Runs on every PR to main/develop branches
    - Jobs: Setup, Lint & Format, Unit Tests (≥80% coverage), Build Verification, Security & Dependencies
    - Nx affected for incremental builds (only changed services)
    - npm audit with critical/high vulnerability detection
    - Bundle size check (< 5MB threshold)
    - SonarQube analysis integration
    - Secret scanning with TruffleHog
    - Parallel job execution with concurrency control
  - `.github/workflows/integration-tests.yml`: Integration test suite
    - Runs on PR to main branch
    - Docker Compose stack startup (PostgreSQL, Redis, LocalStack, services)
    - Integration tests with testcontainers pattern
    - Contract tests placeholder (Pact framework ready)
    - API schema validation (OpenAPI 3.1)
    - Smoke tests for service health endpoints
    - Service logs collection on failure
  - `.github/workflows/security-scan.yml`: Security scanning workflow
    - Runs on PR, daily schedule (2 AM UTC), and manual trigger
    - Secret scanning: TruffleHog with verified secrets detection
    - SAST: SonarQube analysis with TypeScript rules
    - SAST: GitHub CodeQL with security-extended queries
    - Dependency scanning: npm audit + Snyk integration
    - Container scanning: Trivy for Order Service and Notification Service images
    - License compliance: GPL/AGPL forbidden license detection
    - IaC scanning: CDK Nag checks for infrastructure security
    - Results uploaded to GitHub Security tab (SARIF format)

- Phase 3: Infrastructure as Code (Week 6)
  - `infra/` CDK project scaffold (`package.json`, `tsconfig.json`, `cdk.json`)
  - `infra/config/environments.ts`: Typed `EnvironmentConfig` interface with full per-environment settings for dev / staging / pre-prod / prod
  - **NetworkStack** (`infra/lib/network-stack.ts`): VPC (10.x.0.0/16), public / private / isolated subnets across 2–3 AZs, NAT gateways, security groups for ALB / services / RDS / Redis; VPC Flow Logs to CloudWatch (staging+)
  - **DatabaseStack** (`infra/lib/database-stack.ts`): RDS PostgreSQL 16.3 in isolated subnets with Secrets Manager credentials, parameter group with query logging, storage encryption; ElastiCache Redis 7.1 replication group with at-rest and in-transit encryption; Multi-AZ enabled for prod
  - **EventStack** (`infra/lib/event-stack.ts`): Custom EventBridge event bus with event archive; SQS queues (`order-created`, `order-status-changed`) with DLQs and configurable `maxReceiveCount`; EventBridge rules routing events to queues; SQS-managed encryption throughout
  - **SecurityStack** (`infra/lib/security-stack.ts`): JWT + app-config secrets in Secrets Manager; least-privilege IAM execution and task roles per service (EventBridge publish, SQS consume, Secrets Manager read, X-Ray write, CloudWatch metrics); WAF v2 with AWS managed rule sets (CRS, SQLi, KnownBadInputs) + IP-based rate limiting (staging+)
  - **ECSStack** (`infra/lib/ecs-stack.ts`): ECS Fargate cluster with Container Insights; ALB in public subnets with path-based routing; Fargate task definitions for `order-service` (port 3000) and `notification-svc` (port 3001) with health checks, structured logging to CloudWatch, env vars and secrets injection; ECS circuit-breaker with rollback; CPU + memory auto-scaling per service; `enableExecuteCommand` for non-prod debugging
  - **CDNStack** (`infra/lib/cdn-stack.ts`): S3 bucket (versioned, encrypted, block-public-access) for Angular frontend; CloudFront distribution with OAC, HTTP/2+3, TLS 1.2+, security headers response policy, SPA 403/404 → `index.html` rewrites; API and WebSocket path behaviours forwarded to ALB origin; access logs to separate S3 bucket
  - **MonitoringStack** (`infra/lib/monitoring-stack.ts`): SNS alarm topic; CloudWatch alarms for ECS CPU/memory, ALB 5xx error rate and p95 latency, RDS CPU and connections, DLQ depth (any message triggers P1 alert); `OrderFlow-{env}` CloudWatch dashboard with ALB/ECS/RDS/SQS widgets
  - `infra/bin/app.ts`: CDK app entry with full stack dependency graph and per-env termination protection on prod
  - CDK unit tests: 42 assertions across 4 test suites (NetworkStack, DatabaseStack, EventStack, SecurityStack) — all passing
  - `cdk synth --context env=dev` synthesises successfully to `infra/cdk.out`

### Changed

- `.gitignore`: Expanded `.nx/cache/` to `.nx/` — untracked all Nx local runtime files (cache, workspace-data SQLite DBs, project graph, hashes)
- `PRODUCTION_APP_MASTER_PLAN.md`: Moved Phase 2 (Frontend Angular App) to Phase 10 — deferred until after all backend, infrastructure, CI/CD, observability, security, and operations phases are complete. Phases 3–10 renumbered to 2–9. Timeline extended to ~12 weeks. Fortune 500 Compliance Matrix phase references updated accordingly.

### Added

- Phase 2: Containerization & Local Dev (Week 5)
  - Multi-stage Dockerfiles for `order-service` and `notification-svc`
    - Base image: `node:22-alpine` with 3-stage build (builder → pruning → runtime)
    - Non-root user execution (appuser:1001)
    - Health check endpoints configured
    - Target image size: < 150MB per service
  - `.dockerignore` files optimized for both services
  - `docker-compose.yml`: Production-like local stack
    - PostgreSQL 16 with health checks and persistent volumes
    - Redis 7 for caching and WebSocket adapters
    - LocalStack for AWS service emulation (SQS, EventBridge, Secrets Manager)
    - Order Service and Notification Service with health checks
    - Shared `orderflow-network` bridge network
  - `docker-compose.dev.yml`: Hot-reload development environment
    - Volume mounts for live code changes
    - Automatic Prisma migrations on startup
    - Nx watch mode for development
  - Initialization scripts
    - `scripts/init-db.sh`: PostgreSQL database initialization
    - `scripts/localstack-init.sh`: AWS resource provisioning (SQS queues, EventBridge bus/rules, Secrets Manager)

- Phase 1: Backend Microservices (Weeks 2–3)
  - API contract-first: OpenAPI 3.1 specs for Order Service and Notification Service
  - AsyncAPI 3.0 event schema for OrderCreated and OrderStatusChanged events
  - Shared library `libs/shared-types`: domain models, DTOs, event types, pagination, health types
  - Shared library `libs/logger`: Winston structured logger with PII masking, correlation IDs, HTTP middleware
  - Shared library `libs/auth`: JWT RS256 token generation/verification, Express authenticate middleware
  - Shared library `libs/event-schemas`: Zod runtime validation for events, envelope builder
  - Shared library `libs/http-client`: Axios client with circuit breaker (opossum) and retry logging
  - Shared library `libs/testing-utils`: test factories, mock Prisma/logger, Express test-app helper
  - Order Service (`apps/order-service`): Express app with auth routes (register/login/delete), order CRUD, cursor pagination, idempotency keys, audit trail, event publishing via EventBridge, Zod validation, rate limiting, helmet, graceful shutdown, health/readiness probes, Prisma schema
  - Notification Service (`apps/notification-svc`): SQS long-poll consumer with idempotency, DLQ passthrough on max retries, Socket.IO WebSocket push to users, health probes, graceful shutdown
  - `jest.preset.js` workspace Jest preset
  - `.env.example` files for both services
  - `express-rate-limit` added to dependencies
  - Nx `project.json` and TypeScript configs for all new libs and apps

- Phase 0: Foundation & Governance
  - Project directory structure with Nx workspace layout
  - Repository configuration files (.editorconfig, .prettierrc, .eslintrc.json, .nvmrc, .tool-versions)
  - Nx workspace configuration (nx.json, package.json, tsconfig.base.json)
  - GitHub templates (PR template, issue templates, CODEOWNERS)
  - Governance documents (CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md)
  - Architecture Decision Records (ADRs)
  - Operational documents (DEFINITION_OF_DONE, DATA_GOVERNANCE, THREAT_MODEL, etc.)

### Security

- Established security policy in SECURITY.md
- Created initial threat model documentation

## [0.1.0] - YYYY-MM-DD

### Added

- Initial project scaffold
- Repository setup and governance framework

[unreleased]: https://github.com/nilesh0604/orderflow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nilesh0604/orderflow/releases/tag/v0.1.0
