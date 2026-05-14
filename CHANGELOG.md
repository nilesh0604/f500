# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (Frontend F500 Standards)

- `.stylelintrc.json`: Stylelint config with `stylelint-config-standard-scss`, BEM class pattern enforcement, `max-nesting-depth: 3`, no named colors, SCSS variable naming rules
- `.eslintrc.json`: Added Angular ESLint rules for `apps/web` — `@angular-eslint/recommended` for TS files (component/directive selector prefix, lifecycle interface enforcement, no empty lifecycle, prefer OnPush warn); `@angular-eslint/template/recommended` for HTML files (accessibility rules: `alt-text`, `click-events-have-key-events`, `interactive-supports-focus`, `label-has-associated-control`, `valid-aria`, `role-has-required-aria-props`)
- `apps/web-e2e/`: Full Cypress E2E scaffold — `cypress.config.ts`, `project.json` (Nx target), `tsconfig.json`, `src/support/e2e.ts` (cypress-axe import), `src/support/commands.ts` (custom `login` session command, `checkA11y` WCAG 2.1 AA command), `src/fixtures/test-data.ts` (shared mock data), `src/e2e/auth.cy.ts` (login/register flow specs), `src/e2e/orders.cy.ts` (order list + detail specs with intercepted HTTP), `src/e2e/accessibility.cy.ts` (axe WCAG 2.1 AA checks on all 3 screens)
- `lighthouserc.js`: Lighthouse CI config — performance ≥0.90, accessibility ≥0.95, color-contrast/aria/button-name errors, p95 LCP ≤3500ms, CLS ≤0.1, TBT ≤300ms
- `apps/web/src/main.ts`: Added `import '@angular/localize/init'` for i18n readiness
- `apps/web/project.json`: Added `stylelint` executor target; added `analyze` target (webpack-bundle-analyzer); fixed `e2e` target `devServerTarget`
- `package.json`: Added devDependencies `@lhci/cli`, `cypress-axe`, `stylelint`, `stylelint-config-prettier-scss`, `stylelint-config-standard-scss`, `stylelint-scss`, `webpack-bundle-analyzer`, `@angular/localize`; added scripts `stylelint`, `stylelint:fix`, `analyze`, `lhci`; added `*.scss` lint-staged hook
- `.github/workflows/pr-checks.yml`: Added Job 7 `stylelint` (SCSS linting, web-affected only) and Job 8 `lighthouse` (Lighthouse CI, runs after build); both added to `pr-checks-summary` needs and status table

### Fixed (Discovered during test run)

- `apps/web/.eslintrc.json`: Created project-level ESLint config extending root; added `parserOptions.project` pointing to `tsconfig.eslint.json`; removed unsupported `@angular-eslint/prefer-on-push-change-detection` (not in v18) and `@angular-eslint/template/role-has-required-aria-props` rules
- `apps/web/tsconfig.eslint.json`: Created new tsconfig covering all `.ts` files including `jest.config.ts` and environment files, resolving `parserOptions.project` parse errors
- `apps/web/src/app/core/interceptors/auth.interceptor.ts`: Added `void` to `router.navigate()` (`no-floating-promises`)
- `apps/web/src/app/store/auth.store.ts`: Added `void` to all three `router.navigate()` calls (`no-floating-promises`)
- `apps/web/src/app/core/services/websocket.service.ts`: Removed unused `Observable` import (`no-unused-vars`)
- `apps/web/src/app/shared/components/status-badge/status-badge.component.ts`: Added explicit return type to `config` getter (`explicit-function-return-type`)
- `apps/web/src/app/store/orders.store.ts`: Replaced non-null assertion `!` with typed cast (`no-non-null-assertion`)
- `apps/web/src/app/features/orders/order-list/order-list.component.ts`: Read `nextCursor()` signal once into local variable to remove non-null assertion (`no-non-null-assertion`)
- `apps/web/src/app/core/services/order.service.spec.ts`: Added `status` param branch test → branch coverage 75% → 100%
- `apps/web/src/app/core/services/toast.service.spec.ts`: Added `warn()` and default `show()` tests → branch coverage 50% → 100%; global branches now 100% (was 71.42%, below 80% threshold)
- `apps/web/src/styles/_variables.scss` + `main.scss`: Auto-fixed 9 stylelint violations (`color-hex-length`, `color-function-notation`, `alpha-value-notation`, `scss/at-mixin-argumentless-call-parentheses`, `scss/dollar-variable-empty-line-before`)

### Fixed

- `apps/web/jest.config.ts`: Corrected `setupFilesAfterFramework` (invalid key) → `setupFilesAfterEnv`; added explicit `testEnvironment: 'jsdom'` — both caused all 18 frontend unit tests to silently not execute the Angular test setup
- `apps/web/src/app/core/services/toast.service.spec.ts`: Added `crypto.randomUUID` mock in `beforeEach` — jsdom does not expose `crypto.randomUUID`, causing 5 `ToastService` tests to throw `TypeError: crypto.randomUUID is not a function`

### Added

- Phase 10: Frontend Angular App (Weeks 11–12)

  **10.1 Angular Setup**
  - `apps/web/project.json`: Nx project config with build/serve/test/lint/e2e targets; `@angular-devkit/build-angular:browser` executor; production + staging + development configurations
  - `apps/web/tsconfig.json` / `tsconfig.app.json` / `tsconfig.spec.json`: TypeScript project references with strict mode, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`
  - `apps/web/jest.config.ts`: jest-preset-angular setup with 80% coverage threshold across branches/functions/lines/statements
  - `apps/web/proxy.conf.json`: Dev proxy — `/v1` → `http://localhost:3001`, `/socket.io` → `http://localhost:3002` (WebSocket)
  - `apps/web/src/environments/`: `environment.ts` (dev), `environment.staging.ts`, `environment.prod.ts` — all three environments with `apiBaseUrl` and `wsUrl`
  - `apps/web/src/styles/_variables.scss`: Design tokens — color palette, status colors, spacing, typography, shadows, breakpoints
  - `apps/web/src/styles/_mixins.scss`: `respond-to`, `flex-center`, `flex-between`, `truncate`, `card`, `skeleton-shimmer`, `status-badge` mixins
  - `apps/web/src/styles/main.scss`: Angular Material theme (blue/orange/red), global reset, layout utilities (`.container`, `.page`), Material overrides, `:focus-visible` accessibility
  - `package.json`: `socket.io-client@^4.8.1` added to dependencies

  **10.2 App Shell**
  - `apps/web/src/main.ts`: `bootstrapApplication` entry point
  - `apps/web/src/app/app.config.ts`: `ApplicationConfig` with `provideRouter` (withComponentInputBinding), `provideHttpClient` (withInterceptors), `provideAnimationsAsync`
  - `apps/web/src/app/app.routes.ts`: Lazy-loaded routes — `/auth` → `authRoutes`, `/orders` → `ordersRoutes` (guarded), catch-all redirect
  - `apps/web/src/app/app.component.ts`: Root shell — `<router-outlet>` + `<app-toast>`

  **10.3 Core Layer**
  - `apps/web/src/app/core/services/auth.service.ts`: `AuthService` — `login`, `register`, `logout`, `getAccessToken`, `isAuthenticated` (JWT exp check); tokens stored in `sessionStorage`
  - `apps/web/src/app/core/services/order.service.ts`: `OrderService` — `list` (cursor pagination + status filter), `get`, `create` (Idempotency-Key header), `updateStatus`
  - `apps/web/src/app/core/services/websocket.service.ts`: `WebSocketService` — `socket.io-client` with JWT auth, `order:status_changed` events exposed as `orderStatus$` Observable; auto-reconnect (5 attempts)
  - `apps/web/src/app/core/services/toast.service.ts`: `ToastService` — Signal-based toast queue; `show/success/error/warn/dismiss`; auto-dismiss with configurable duration
  - `apps/web/src/app/core/interceptors/auth.interceptor.ts`: Functional `authInterceptor` — attaches `Authorization: Bearer <token>` header; redirects to `/auth/login` on 401
  - `apps/web/src/app/core/interceptors/error.interceptor.ts`: Functional `errorInterceptor` — surfaces `error.message` via ToastService for all non-401 HTTP errors
  - `apps/web/src/app/core/guards/auth.guard.ts`: Functional `authGuard` — redirects unauthenticated users to `/auth/login`

  **10.4 NgRx Signal Store**
  - `apps/web/src/app/store/auth.store.ts`: `AuthStore` — `isAuthenticated`, `isLoading`, `error` state; `init`, `login`, `register`, `logout` methods using `rxMethod`
  - `apps/web/src/app/store/orders.store.ts`: `OrdersStore` — `orders[]`, `selectedOrder`, pagination state; `loadOrders` (append-on-cursor), `loadOrder`, `createOrder`, `updateOrderStatus`, `applyRealtimeUpdate`

  **10.5 Shared Components**
  - `apps/web/src/app/shared/components/toast/toast.component.ts`: `ToastComponent` — fixed bottom-right toast list with type-specific icons/colors; slide-in animation; ARIA live region
  - `apps/web/src/app/shared/components/skeleton/skeleton.component.ts`: `SkeletonComponent` — configurable width/height/borderRadius shimmer placeholder with ARIA status
  - `apps/web/src/app/shared/components/status-badge/status-badge.component.ts`: `StatusBadgeComponent` — pill badge for all 5 order statuses with color-coded backgrounds; ARIA label

  **Screen 1 — Login/Register**
  - `apps/web/src/app/features/auth/auth.routes.ts`: Auth lazy routes
  - `apps/web/src/app/features/auth/login/login.component.ts`: Login form — reactive form with email/password, password visibility toggle, error banner, loading spinner; routes to `/orders` on success
  - `apps/web/src/app/features/auth/register/register.component.ts`: Register form — password complexity regex (upper+lower+digit+special, 8–72 chars), GDPR consent checkbox with `requiredTrue` validator, `consentTimestamp` sent as ISO-8601

  **Screen 2 — Order List**
  - `apps/web/src/app/features/orders/orders.routes.ts`: Orders lazy routes (list + detail)
  - `apps/web/src/app/features/orders/create-order-dialog/create-order-dialog.component.ts`: Create Order modal — itemName/quantity/notes form; UUID idempotency key generated client-side
  - `apps/web/src/app/features/orders/order-list/order-list.component.ts`: Order list — Material table with 5 columns; skeleton loading rows; empty state; cursor-based "Load more"; real-time status badge updates via WebSocket subscription; WebSocket connectivity indicator in toolbar

  **Screen 3 — Order Detail**
  - `apps/web/src/app/features/orders/order-detail/order-detail.component.ts`: Order detail — 4-step status timeline (pending → confirmed → shipped → delivered) with icon indicators and connector lines; order info grid; "Mark as next status" action button; WebSocket toast notification on real-time status change; `@Input() id` binding via `withComponentInputBinding`

  **Unit Tests (3 suites)**
  - `apps/web/src/app/core/services/auth.service.spec.ts`: 5 tests — login stores tokens, register stores tokens, logout clears sessionStorage, `isAuthenticated` false with no token, false with expired token
  - `apps/web/src/app/core/services/order.service.spec.ts`: 6 tests — list, list with cursor/limit params, get, create with Idempotency-Key, updateStatus body
  - `apps/web/src/app/core/services/toast.service.spec.ts`: 6 tests — add toast, auto-dismiss, dismiss by id, 4000ms default, 6000ms error duration

- Phase 8: Performance & Resilience (Weeks 9–10)

  **8.1 Performance Optimization**
  - `apps/order-service/src/app/middleware/cache.middleware.ts`: Redis response cache for `GET /v1/orders`
    - `ordersCacheMiddleware` — Redis-backed per-user list cache (TTL 30 s); `X-Cache: HIT/MISS` header; `Cache-Control: private, max-age=30` on all list responses; gracefully degrades to pass-through if Redis is unavailable
    - `invalidateOrdersCache` — SCAN-based key eviction for all list variants of a given user; called after `createOrder` and `updateOrderStatus` to maintain consistency
  - `apps/order-service/src/app/app.ts`: `compression` middleware added (gzip level 6, threshold 1 KB); fires before body parsing so all JSON responses ≥ 1 KB are compressed
  - `apps/order-service/src/app/db/prisma.client.ts`: `buildDatabaseUrl` injects Prisma connection-pool parameters at runtime: `connection_limit=20`, `pool_timeout=10`, `connect_timeout=10`, `statement_cache_size=0` (PgBouncer-safe)
  - `apps/order-service/src/types/compression.d.ts`: Local TypeScript declaration shim for `compression` module
  - `apps/order-service/src/app/routes/orders.router.ts`: `ordersCacheMiddleware` applied to `GET /v1/orders`

  **8.2 Resilience Patterns**
  - `apps/order-service/src/app/middleware/resilience.ts`: Resilience primitives
    - `retryWithBackoff` — up to N attempts with exponential backoff + ±25 % jitter; per-attempt timeout via `Promise.race`
    - `createCircuitBreaker` — opossum circuit-breaker factory with configurable thresholds; logs OPEN / HALF-OPEN / CLOSED / fallback events via `@orderflow/logger`
  - `apps/order-service/src/app/events/event.publisher.ts`: EventBridge `publishEvent` wrapped with `createCircuitBreaker` + `retryWithBackoff` (3 attempts, 200 ms base, 5 s timeout); circuit breaks at 50 % failure rate, resets after 10 s
  - `apps/notification-svc/src/app/consumers/sqs.consumer.ts`: Per-message 5 s processing timeout via `Promise.race`; on timeout: degraded delete (message removed to avoid DLQ churn) with `warn` log; non-timeout errors preserve existing retry behaviour

  **8.3 Auto-Scaling**
  - `infra/lib/ecs-stack.ts`:
    - `notificationService` — added `scaleOnMemoryUtilization` (target 70 %, matching order-service)
    - Both services — `scaleOnSchedule` added: scale-out at 08:00 UTC to 50 % of `maxCapacity`, scale-in at 22:00 UTC back to `minCapacity`
    - `aws-cdk-lib/aws-applicationautoscaling` imported for `Schedule.cron`

  **8.4 Capacity Planning**
  - `docs/CAPACITY_PLAN.md`: Baseline capacity document
    - Per-service resource tables (CPU, memory, min/max tasks, DB/Redis connections, max RPS)
    - PostgreSQL connection ceiling formula; slow-query threshold documentation
    - SQS depth alert thresholds (alert at 1 000, DLQ at 1)
    - Storage growth projections (S3, PG orders+audit, CloudWatch logs)
    - Cost-per-request FinOps breakdown (~$0.00007 / req at 500 RPS)
    - RDS read replicas documented (not deployed) with Prisma migration path

  **8.5 Load Testing**
  - `scripts/load-tests/k6/order-service.baseline.js`: Baseline — 500 RPS constant for 10 min; thresholds: p95 < 200 ms, p99 < 500 ms, error < 0.1 %
  - `scripts/load-tests/k6/order-service.spike.js`: Spike — ramp 100→2000 RPS over 30 s, sustain 2 min, ramp down; thresholds: p95 < 500 ms, error < 1 %
  - `scripts/load-tests/k6/order-service.soak.js`: Soak — 200 RPS for 1 h with mixed read/write (10 % creates); thresholds: p95 < 200 ms, error < 0.1 %

- Phase 7: Security Hardening (Week 9)

  **7.1 Application Security**
  - `apps/order-service/src/app/middleware/security.middleware.ts`: New security middleware module
    - `strictCors` — allowlist-only CORS (env-driven `CORS_ORIGIN`); returns 403/204 on preflight from unknown origins; no wildcard `*`
    - `securityHeaders` — CSP (`default-src 'none'`), `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production only
    - `perUserRateLimit` — 200 req/15 min keyed on `userId` post-auth (orders router)
    - `requestSizeGuard` — 413 for POST/PUT/PATCH bodies > 100 KB (checked via `Content-Length` header)
  - `apps/order-service/src/app/middleware/data-classification.middleware.ts`: Data classification middleware
    - `dataClassificationMiddleware` — attaches `X-Data-Classification` response header (Public / Internal / Confidential / Restricted) per route
    - `PII_FIELD_REGISTRY` — maps domain entity fields to data classification level and applicable regulation (GDPR, CCPA)
  - `apps/order-service/src/app/app.ts`: Middleware chain hardened
    - Replaced loose `cors({ origin: '*' })` with `strictCors`
    - Added `securityHeaders`, `dataClassificationMiddleware`, `requestSizeGuard`
    - Helmet called with `contentSecurityPolicy: false` (custom CSP via `securityHeaders`), `crossOriginEmbedderPolicy: false`
    - `app.set('trust proxy', 1)` for correct IP resolution behind ALB
    - Global body limit tightened from 1 MB → 100 KB
  - `apps/order-service/src/app/routes/orders.router.ts`: `perUserRateLimit` applied after `authenticate`; `:id` params validated as UUID via `orderIdParamSchema` before service calls
  - `apps/order-service/src/app/validation/auth.schemas.ts`: Password complexity regex (uppercase + lowercase + digit + special char); email normalised to lowercase; `consentTimestamp` rejected if in the future; password max 72 chars on login
  - `apps/order-service/src/app/validation/order.schemas.ts`: `itemName` and `notes` trimmed; `cursor` validated as UUID; new `orderIdParamSchema` for path param injection prevention

  **7.2 Infrastructure Security**
  - `infra/lib/security-stack.ts`: Secrets Manager tags — `RotationPolicyDays`, `DataClassification`, `ManagedRotation` on JWT and app-config secrets; WAF CloudWatch log group (`aws-waf-logs-orderflow-{env}`); `CfnLoggingConfiguration` wiring WAF → log group; WAF access logs S3 bucket with lifecycle expiry; `aws-cdk-lib/aws-logs` and `aws-cdk-lib/aws-s3` imports added

  **7.3 CI/CD Security**
  - `.github/workflows/sbom.yml`: SBOM generation workflow
    - Triggers: on release (published), weekly Sunday 03:00 UTC, workflow_dispatch
    - Generates CycloneDX JSON SBOM via `@cyclonedx/cyclonedx-npm`
    - Validates no GPL-2.0 / GPL-3.0 / AGPL-3.0 licensed components
    - Uploads SBOM as 90-day workflow artifact
    - Attaches SBOM to GitHub release as asset
    - `verify-image-tags` job — enforces SHA-based (immutable) image tags in ECS task definitions on every release

  **7.4 Data Governance & Privacy**
  - PII field registry (`PII_FIELD_REGISTRY`) documents all PII fields with classification + regulation reference
  - `X-Data-Classification` header creates auditable data-flow trail for every HTTP response
  - GDPR right-to-deletion (soft-delete with email hash replacement) already implemented in `auth.service.ts` (Phase 1); confirmed in SOC 2 controls map

  **7.5 Compliance**
  - `docs/adr/ADR-009-owasp-top10-mitigations.md`: Complete OWASP Top 10 (2021) mitigation map with evidence links to source files for each of the 10 categories
  - `docs/SOC2_CONTROLS.md`: SOC 2 Type II controls mapping (CC1–CC9) with evidence artefacts, simulated quarterly access review checklist, and penetration test checklist

  **Security Tests (34 new)**
  - `apps/order-service/src/app/middleware/security.middleware.spec.ts`: 15 tests covering `strictCors` (allowed/denied origins, preflight, same-origin), `securityHeaders` (all required headers, HSTS only in prod), `requestSizeGuard` (small pass, oversized POST blocked, GET allowed)
  - `apps/order-service/src/app/validation/auth.schemas.spec.ts`: 7 tests — password complexity, length limits, email normalisation, future `consentTimestamp` rejection
  - `apps/order-service/src/app/validation/order.schemas.spec.ts`: 12 tests — whitespace trimming, boundary values, UUID cursor validation, path-traversal and SQLi injection via `orderIdParamSchema`

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
