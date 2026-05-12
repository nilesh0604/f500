# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 6: Observability & Monitoring (Week 8)

  **Three Pillars — Logs**
  - `libs/logger/src/lib/logger.ts`: Extended PII masking — email, phone (E.164), SSN, credit card, IPv4 address patterns + field-level masking for `email`, `phone`, `password`, `token`, `secret`, `authorization`
  - `libs/logger/src/lib/logger.ts`: Trace-to-log correlation transform — injects `traceId` / `spanId` from active OTel span into every JSON log line
  - `libs/logger/src/lib/logger.ts`: Log-level routing metadata — `_routing: pagerduty | slack | cloudwatch` added to each log entry
  - `libs/logger/src/lib/http-log.middleware.ts`: HTTP middleware upgraded — 5xx logs at `error` level (was always `info`), `x-trace-id` response header set from active span, `traceId`/`spanId` included in access logs

  **Three Pillars — Metrics**
  - `libs/logger/src/lib/metrics.ts`: CloudWatch custom metrics publisher
    - `recordRedMetrics()` — Rate/Error/Duration per route+method (namespace `OrderFlow/App`)
    - `recordBusinessMetric()` — generic business metric with arbitrary dimensions
    - `recordSqsProcessingMetrics()` — SQS message processed/error/duration per event type
  - `apps/order-service/src/app/middleware/red-metrics.middleware.ts`: Express middleware auto-recording RED metrics for every HTTP request
  - `apps/order-service/src/app/app.ts`: `redMetricsMiddleware` registered in middleware chain
  - `apps/order-service/src/app/services/order.service.ts`: `OrdersCreated` and `OrderStatusChanges` business metrics recorded on each operation
  - `apps/notification-svc/src/app/consumers/sqs.consumer.ts`: SQS processing duration/error metrics recorded per event type

  **Three Pillars — Traces (AWS X-Ray / OpenTelemetry)**
  - `libs/logger/src/lib/tracer.ts`: OpenTelemetry Node SDK bootstrap
    - `initTracing(serviceName)` — configures resource attributes, `TraceIdRatioBasedSampler` (5% default, overridable via `OTEL_SAMPLING_RATIO`)
    - OTLP HTTP exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; console exporter otherwise
    - Auto-instrumentation: HTTP, Express, PostgreSQL (`pg`)
    - `withSpan(tracer, name, fn, attrs)` — utility for manual span creation with automatic OK/ERROR status and exception recording
    - `getTraceContext()` — extracts `traceId`/`spanId` from active span context
  - `apps/order-service/src/main.ts`: `initTracing('order-service')` called before any imports
  - `apps/notification-svc/src/main.ts`: `initTracing('notification-svc')` called before any imports
  - `apps/order-service/src/app/services/order.service.ts`: `order.create` and `order.updateStatus` custom spans with semantic attributes (`order.id`, `order.userId`, `order.itemName`, `order.quantity`, `order.idempotent`, `order.fromStatus`, `order.targetStatus`)
  - `apps/notification-svc/src/app/consumers/sqs.consumer.ts`: `sqs.process.<eventType>` span per message with messaging semantic conventions (`messaging.system`, `messaging.operation`, `messaging.message_id`, `event.type`, `correlation.id`)
  - `libs/logger/src/index.ts`: All new exports surfaced (`initTracing`, `getTraceContext`, `withSpan`, `otelTrace`, `otelContext`, `SpanStatusCode`, `recordRedMetrics`, `recordBusinessMetric`, `recordSqsProcessingMetrics`, `maskObjectPii`)

  **Infra — ObservabilityStack (`infra/lib/observability-stack.ts`)**
  - Severity-routed SNS topics: P1-Critical, P2-High, P3-Medium, P4-Low
  - CloudWatch Log Groups with 30-day retention for both services
  - **X-Ray sampling rules**: default 5% (`orderflow-{env}-default`), 100% on errors (`orderflow-{env}-errors`, priority 1)
  - Infrastructure alarms: ECS CPU/memory (order-service P2, notification-svc P3), ALB 5xx rate P2, ALB p95 latency P3, RDS CPU/connections P3, DLQ depth P1
  - **SLO alarms**: p95 latency > 200ms (SLO target breach)
  - **Error budget burn-rate alarms**: fast-burn (2% in 1h → P1), slow-burn (5% in 6h → P2)
  - **Anomaly detection**: CloudWatch `CfnAnomalyDetector` on ALB request count (3σ band, P3) and `OrdersCreated` business metric
  - **Log metric filter**: `OrderServiceErrors` metric from structured JSON logs, alarm on > 10 errors/min (P2)
  - **CloudWatch Synthetics Canary** (`orderflow-{env}-health`): health + readiness probes every 60s, P1 alarm on failure, artifacts in dedicated S3 bucket (30-day lifecycle)
  - **SLO Dashboard** (`OrderFlow-{env}-SLO`): 6-row dashboard — header with SLO targets, RED metrics (Rate/Errors/Duration with p50/p95/p99 latency + SLO annotation), error budget burn rate, business metrics (orders created/status changes), ECS CPU/memory, RDS/SQS, Synthetics canary success %, active alarm status widget
  - `infra/bin/app.ts`: `ObservabilityStack` instantiated alongside existing `MonitoringStack`; wired with `albDnsName` for Synthetics

  **Dependencies added**
  - `@aws-sdk/client-cloudwatch@^3.699.0`
  - `@opentelemetry/exporter-trace-otlp-http@^0.54.0`
  - `@opentelemetry/resources@^1.27.0`
  - `@opentelemetry/semantic-conventions@^1.27.0`

  **Test fixes**
  - `apps/notification-svc/src/app/consumers/sqs.consumer.spec.ts`: Updated `@orderflow/logger` mock to include `otelTrace`, `withSpan`, `recordSqsProcessingMetrics`

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

- Phase 5: CD Pipeline — Deployment (Weeks 7–8)
  - `.github/workflows/deploy-staging.yml`: Automated staging deployment
    - Triggered on merge to main branch
    - Jobs: Build & Push Docker images, Database Migrations, Deploy to ECS Staging
    - Smoke tests post-deployment with health endpoint validation
    - Slack notifications for deployment success/failure
    - AWS OIDC authentication (no long-lived credentials)
  - `.github/workflows/deploy-production.yml`: Production canary deployment
    - Workflow dispatch with release tag and canary percentage selection (10/25/50%)
    - CAB (Change Advisory Board) approval gate before production
    - Build production images with semantic versioning
    - Pre-deployment health checks and database compatibility validation
    - Database migrations (forward-only, backward-compatible)
    - Canary deployment with traffic percentage control
    - 15-minute canary monitoring with CloudWatch metrics
    - Full rollout approval gate with manual confirmation
    - Post-deployment verification with smoke tests
    - PagerDuty integration for critical deployment failures
  - `.aws/task-definitions/`: ECS task definition templates
    - Staging task definitions for order-service and notification-svc (512 CPU, 1024 MB)
    - Production task definitions (1024 CPU, 2048 MB) with stopTimeout for graceful shutdown
    - Health checks configured (30s interval, 5s timeout, 60s startPeriod)
    - Secrets injection from AWS Secrets Manager
    - ulimits configuration for high-throughput scenarios
  - `infra/lib/appconfig-stack.ts`: AWS AppConfig for feature flags
    - Application and environment configuration for each deployment stage
    - Feature flags: newOrderWorkflow, enhancedNotifications, realTimeOrderTracking, paymentRetryLogic, orderAnalytics
    - Dynamic configuration for orderService, notificationService, circuitBreaker, rateLimiting
    - Canary deployment strategy (25% traffic increase, 15-minute duration)
    - IAM role for ECS tasks to access AppConfig
  - `infra/lib/rollback-stack.ts`: Auto-rollback infrastructure
    - Lambda function for automatic rollback on error rate spikes
    - CloudWatch alarms for 5xx errors (order-service and notification-svc)
    - Circuit breaker failure detection
    - SNS topic for rollback notifications
    - Cross-service rollback coordination
  - `infra/lib/rollback/index.js`: Auto-rollback Lambda function
    - Parses alarm events to identify affected services
    - Finds previous stable task definition
    - Executes ECS service update with rollback
    - Records rollback metrics to CloudWatch
    - Sends success/failure notifications via SNS
  - `apps/order-service/test/smoke/`: Smoke test suite
    - Health endpoint validation (/health, /ready, /live)
    - API endpoint availability checks
    - Authentication validation (401/400 responses)
    - CORS headers verification
    - Response time SLAs (< 500ms for health checks)
    - Concurrent request handling
  - `apps/order-service/test/smoke/load.spec.ts`: Load test suite
    - Configurable concurrent users and duration
    - Ramp-up period for steady-state testing
    - P95 latency measurement
    - Error rate validation (< 1%)
    - Burst traffic stress tests (50 concurrent requests)
  - `package.json`: Added `test:smoke` script for smoke test execution
  - Updated `infra/bin/app.ts`: Integrated AppConfigStack and RollbackStack into CDK app

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
