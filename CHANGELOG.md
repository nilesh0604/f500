# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Single environment simplification** — Removed dev/staging configurations, keeping only prod:
  - `infra/config/environments.ts` — Removed `devConfig`, `stagingConfig`, `getConfig()`, and `environments` map; now exports single `export const config` with prod values only
  - `infra/bin/app.ts` — Updated import to use `config` directly instead of `getConfig()`
  - Updated documentation across `infra/CLAUDE.md`, `docs/AWS_COST_ANALYSIS.md`, `docs/CAPACITY_PLAN.md`, `docs/adr/ADR-011-single-env-cost-optimisation.md`, `docs/SANDBOX_COST_REDUCTION_PLAN.md`, and `docs/IMPLEMENTATION_PLAN_VYASA_RAG.md`

### Added

- **Dev sandbox deployed to `us-east-1`** — Vyasa-only stack at near-zero cost:
  - `OrderFlow-dev-VyasaVector` — S3 Vectors bucket + index for Bedrock KB
  - `OrderFlow-dev-VyasaRag` — Lambda + API Gateway (`https://lkbzhoe1pj.execute-api.us-east-1.amazonaws.com`)
  - `OrderFlow-dev-VyasaUi` — CloudFront + S3 (`https://d2j5xbveesoc8s.cloudfront.net`)
  - References existing DynamoDB tables and S3 buckets via `fromTableName`/`fromBucketName` (dev env)
  - Hardcoded Bedrock KB ID `JGDXZQCA1Y` for dev (skips custom resource creation)
  - `infra/bin/app.ts` — env-prefixed stack names (`OrderFlow-dev-*` for dev, `OrderFlow` for prod); wired VyasaUi API endpoint directly to VyasaRag stack output

### Removed

- **All prod stacks deleted** — `OrderFlow-VyasaUi`, `OrderFlow-Prod-VyasaRag`, `OrderFlow-Prod-VyasaVector`, `OrderFlow-Prod-VyasaUi` removed from `us-east-1`
- **All `us-east-2` stacks deleted** — `OrderFlow-VyasaUi`, `OrderFlow-VyasaVector`, `OrderFlow-Network` removed (previous failed cross-region attempt)
- **Orphaned dev stacks deleted** — `OrderFlow-Dev-VyasaRag`, `OrderFlow-Dev-VyasaVector` removed from `us-east-1`

---

- **Sandbox cost reduction plan** (`docs/SANDBOX_COST_REDUCTION_PLAN.md`): Dev config targeting ~$38/month (from ~$170/month):
  - `infra/config/environments.ts` — added 8 optional fields to `EnvironmentConfig` interface (`enableRedis`, `enableNotificationSvc`, `skipObservability`, `skipMonitoring`, `skipRollback`, `skipAppConfig`, `skipCdn`, `usePublicSubnets`); renamed `config` export to `prodConfig`; added `devConfig` (256/512 ECS, db.t3.micro 20 GB, no NAT GW, no Redis, no notification-svc, 7-day log retention); added `getConfig()` selector keyed on `CDK_ENV` env var; `config` re-exported via `getConfig()` for backward compatibility
  - `infra/lib/database-stack.ts` — wrapped ElastiCache Redis resources in `if (config.enableRedis !== false)` guard; emits `RedisEndpoint` CfnOutput only when Redis is created; sets `redisEndpoint`/`redisPort` to empty strings when disabled
  - `infra/lib/ecs-stack.ts` — ECS Fargate services placed in public subnets with `assignPublicIp: true` when `usePublicSubnets === true`; `REDIS_HOST`/`REDIS_PORT` env vars set to empty strings when `enableRedis === false`; notification-svc task definition, service, autoscaling, and target group skipped when `enableNotificationSvc === false`; scheduled scaling skipped when `maxCapacity === 1`
  - `infra/bin/app.ts` — imports `getConfig()` instead of `config`; CDNStack, MonitoringStack, ObservabilityStack, AppConfigStack, RollbackStack wrapped in `if (!config.skip*)` guards; `Environment` tag uses `config.envName` dynamically

### Deploy dev sandbox

```bash
export CDK_ENV=dev
cd infra && npx cdk diff
npx cdk deploy --all --require-approval broadening
```

- **Custom domain `vyasa.nshinde.xyz` for Vyasa UI CloudFront distribution** (`docs/adr/ADR-012-custom-domain-cloudfront.md`):
  - `infra/config/environments.ts` — added `vyasaDomainName?: string` to `EnvironmentConfig` interface; set to `vyasa.nshinde.xyz` in prod config
  - `infra/lib/vyasa-ui-stack.ts` — added `domainName` prop; ACM cert with DNS validation; `domainNames` + `certificate` on CloudFront distribution; renamed CF function + log group to avoid orphan conflicts; removed fixed bucket names
  - `infra/bin/app.ts` — passes `config.vyasaDomainName` to `VyasaUiStack`; hardcoded API endpoint from `OrderFlow-Prod-VyasaRag` (cross-stack export workaround)
  - New CloudFront distribution: `EP5RB7V8B8LOQ` / `d3qhic431njv7c.cloudfront.net`
  - DNS: `vyasa CNAME → d3qhic431njv7c.cloudfront.net` in Namecheap
  - Note: `.xyz` blocked by corp DNS on managed devices — use CloudFront URL for testing

- **ADR-011: Cost optimisation — single env + right-sizing** (`docs/adr/ADR-011-single-env-cost-optimisation.md`):
  - RDS downsized `db.t3.medium` Multi-AZ → `db.t3.small` Single-AZ, 100 GB → 50 GB (saves ~$160/mo)
  - ECS `desiredCount` + `minCapacity` lowered from 2 → 1 per service (saves ~$65/mo)
  - Combined with single-env + NAT GW + CloudFront changes: **~$265/mo total saving**
  - Expected monthly: $689–898 vs previous $954–1,148
  - ⚠️ RDS modification on next `cdk deploy` will cause ~1–5 min DB downtime

- **Single-environment infrastructure** — removed dev/staging/pre-prod configs, one `prod` environment:
  - `infra/config/environments.ts` — replaced `environments` map with a single exported `config` object; 1 NAT GW (cost saving), Multi-AZ RDS, `PriceClass_100` CloudFront
  - `infra/bin/app.ts` — removed `env` context lookup; imports `config` directly; stack prefix is now `OrderFlow` (was `OrderFlow-Prod-*`)
  - `.github/workflows/vyasa-rag-cd.yml` — collapsed staging + evaluation + production pipeline to a single `deploy` job; deploys `OrderFlow-VyasaVector` + `OrderFlow-VyasaRag`
  - `.github/workflows/vyasa-ui-cd.yml` — updated all stack name references from `OrderFlow-Prod-VyasaUi` → `OrderFlow-VyasaUi`, removed `--context env=prod` flag

- **AWS Infrastructure Cost Analysis** (`docs/AWS_COST_ANALYSIS.md`):
  - Full per-environment monthly cost breakdown across all 13 CDK stacks
  - Covers OrderFlow (ECS/RDS/Redis/ALB/WAF) and Vyasa Intelligence (Lambda/Bedrock/S3Vectors/CloudFront)
  - Bedrock Nova Pro inference identified as dominant variable cost ($25–500/month depending on env)
  - Optimization recommendations: RAG response caching, VPC Gateway Endpoints, ECS scheduled scaling, reduced ingestion jobs
  - Quick-wins checklist and AWS Budgets alert recommendations

- **Vyasa UI — S3 + CloudFront Production Deployment**:
  - `infra/lib/vyasa-ui-stack.ts` — new CDK stack: private S3 bucket (OAC),
    CloudFront distribution with `/api/*` behaviour proxied to the Vyasa RAG
    API Gateway endpoint, SPA 403/404 → `index.html` fallback, HTTP/2+3,
    TLS 1.2+, security headers, access-log bucket, per-env price class.
  - `infra/bin/app.ts` — `VyasaUiStack` registered as `${stackPrefix}-VyasaUi`,
    dependent on `VyasaLambdaStack` for the `functionUrl` output.
  - `.github/workflows/vyasa-ui-cd.yml` — CI/CD pipeline: build → deploy CDK
    (staging) → S3 sync with immutable cache headers → CloudFront invalidation
    → smoke test → deploy to production with same pattern.

- **Vyasa Intelligence UI** (`apps/vyasa-ui`): Standalone React 18 + Vite + TailwindCSS
  chat interface for the `vyasa-rag-service`.
  - `src/services/vyasa.service.ts` — API client for `/chat`, `/chat/stream` (SSE), `/health`
  - `src/hooks/useChat.ts` — state hook managing messages, sessions, streaming, abort
  - `src/components/AgentSteps.tsx` — collapsible accordion of ReAct agent steps
  - `src/components/MessageBubble.tsx` — user/assistant message rendering with streaming cursor
  - `src/components/ChatInput.tsx` — auto-resizing textarea with quick-start suggestions
  - `src/components/SessionSidebar.tsx` — session history sidebar with new-conversation button
  - `src/components/ChatPage.tsx` — main chat layout with auto-scroll
  - Dev server on port 4201; Vite proxy `/api` → `vyasa-rag-service`

### Fixed

- **Answer Relevance evaluator rubric (Langfuse)**: The Langfuse LLM eval job
  "Answer Relevance" used a noncommittal flag where `0 = committal (good)` and
  `1 = noncommittal (bad)`, storing the raw value as the score — inverting the
  metric so all good answers scored `0`.
  - Added `apps/vyasa-rag-service/eval/langfuse/answer-relevance.ts` with
    `calculateAnswerRelevance()` that returns `1` for committal/relevant answers
    and `0` for noncommittal ones.
  - `run-experiment.ts` now posts a corrected `Answer Relevance` score (source:
    `API`) via `langfuse.score()` on each trace, overriding the inverted eval
    job score for future experiment runs.

### Added

- **Langfuse Integration for RAG Evaluation**: New evaluation framework to run experiments
  against live API (production or local dev server) and capture baseline scores.
  - `apps/vyasa-rag-service/eval/langfuse/client.ts` - Langfuse client initialization
  - `apps/vyasa-rag-service/eval/langfuse/upload-dataset.ts` - Upload golden dataset to Langfuse
  - `apps/vyasa-rag-service/eval/langfuse/task-adapter.ts` - Bridge RAG API to Langfuse format
  - `apps/vyasa-rag-service/eval/langfuse/run-experiment.ts` - Execute evaluation experiments
  - Supports both production API Gateway and local dev server (`EVAL_LOCAL=true`)
  - **MCP Server**: Added Langfuse MCP server to `.mcp.json` for direct result access in Windsurf
  - Environment variables: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`,
    `LANGFUSE_MCP_AUTH`, `VYASA_API_ENDPOINT`, `VYASA_API_KEY`, `VYASA_API_TIMEOUT`, `EVAL_LOCAL`

---

## [1.1.1] — 2026-05-24 — Lambda Runtime: Node.js 20 → 22 (AWS EOL Compliance)

### Changed

- **`infra/lib/vyasa-lambda-stack.ts`**: `KbCreatorFn` runtime upgraded `NODEJS_20_X` → `NODEJS_22_X`.
- **`infra/lib/vyasa-vector-stack.ts`**: `VectorCreatorFn` runtime upgraded `NODEJS_20_X` → `NODEJS_22_X`.
- **`infra/lib/rollback-stack.ts`**: `RollbackFunction` runtime upgraded `NODEJS_20_X` → `NODEJS_22_X`.
- **`infra/package.json`**: `aws-cdk-lib` and `aws-cdk` upgraded `2.170.0` → `2.1124.1` so CDK-internal
  custom resource provider framework functions (`KbProvider`, `VectorProvider`, `CustomS3AutoDeleteObjects`)
  also adopt the Node.js 22 default runtime on next deploy.

> **Reason**: AWS notified that Node.js 20.x Lambda runtime reaches EOL on 2026-04-30. Security patches
> stopped; function creation blocked from 2026-08-31; updates blocked from 2026-09-30.
> All 5 affected `us-east-1` functions resolved via CDK code + version bump.

---

## [1.1.0] — 2026-05-23 — Vyasa RAG: S3 Vectors Migration + Ingestion Fix

> **Status**: ✅ PRODUCTION — 9,362 vectors indexed, chat endpoint live, ~$0.07/mo vector cost
> **API**: `https://t859xz8d3c.execute-api.us-east-1.amazonaws.com`
> **KB ID**: `JGDXZQCA1Y` | **DS ID**: `5DGY6OL5YG` | **Region**: `us-east-1`

### Fixed

- **S3 Vectors ingestion — `nonFilterableMetadataKeys`**: Root cause of all ingestion failures was
  using `AMAZON_BEDROCK_TEXT_CHUNK` instead of the AWS-documented `AMAZON_BEDROCK_TEXT`. Fixed in
  `infra/lib/s3vector-creator/index.mjs`. Full Mahabharata corpus now indexed: **2,328 pages →
  9,362 vectors**, 0 failures.
- **S3 Vectors `ConflictException`**: `CreateVectorBucketCommand` throws `ConflictException` (not
  `BucketAlreadyExists`) when bucket exists — added correct error name to idempotency guard.
- **`clientToken` length validation**: Bedrock `StartIngestionJob` requires ≥ 33-char token;
  replaced `ingest-${Date.now()}` (24 chars) with `uuidv4()` (36 chars) in `ingest.ts`.
- **CloudFormation `EarlyValidation` on `VectorIndexName`**: Bedrock rejects both `indexArn` +
  `indexName` together; removed `indexName` from `s3VectorsConfiguration` in `bedrock-kb-creator`.
- **`Runtime.ImportModuleError`**: Lambda handler path corrected from `index.handler` → `main.handler`.
- **API Gateway 403**: Lambda Function URL blocked by account-level public access policy; replaced
  with API Gateway HTTP API (`aws-apigatewayv2`).
- **Claude 3 Haiku `ResourceNotFoundException`**: Model requires explicit approval; switched to
  Amazon Nova Pro (`amazon.nova-pro-v1:0`) which is available without approval.
- **Build errors (14 TypeScript)**: Fixed `TS2307` path alias, wrong DynamoDB command names,
  `TS2339` token usage property, `AgentStep[]` typing, circuit-breaker generic constraint.

### Added

- **`infra/lib/vyasa-vector-stack.ts`**: New CDK stack — creates S3 vector bucket + index via
  Lambda custom resource (`s3vector-creator`). Replaces `VyasaAossStack` entirely.
- **`infra/lib/s3vector-creator/index.mjs`**: Lambda asset — creates/updates/deletes S3 vector
  bucket and index using `@aws-sdk/client-s3vectors`. Handles `Update` by deleting+recreating
  index so `nonFilterableMetadataKeys` changes take effect (index config is immutable).
- **`infra/lib/bedrock-kb-creator/index.mjs`**: Lambda asset — creates Bedrock KB + S3 data
  source via SDK (CloudFormation `AWS::Bedrock::KnowledgeBase` schema rejects `S3_VECTORS`).
- **Prompt files**: `vyasa-system`, `vyasa-agent`, `vyasa-reflection` uploaded to
  `s3://vyasa-rag-prompts-dev-947612421212/`.

### Changed

- **`infra/lib/vyasa-lambda-stack.ts`**: Replaced `CfnKnowledgeBase`+`CfnDataSource` with Lambda
  custom resource (`KbCreatorFn`); KB/DS IDs now read from custom resource `Data` attributes.
- **`infra/bin/app.ts`**: `VyasaAossStack` → `VyasaVectorStack`; props updated to
  `vectorIndexArn`, `vectorBucketName`, `vectorIndexName`.
- **`apps/vyasa-rag-service/src/services/bedrock-client.ts`**: Switched `InvokeModelCommand` →
  `ConverseCommand`/`ConverseStreamCommand`; model changed from `anthropic.claude-3-haiku` →
  `amazon.nova-pro-v1:0`.
- **`apps/vyasa-rag-service/src/services/agent.ts`**: Multi-turn context fix — last 6 messages
  truncated, formatted as `Human:`/`Assistant:` turns, section skipped when history is empty.
- **`apps/vyasa-rag-service/src/handlers/ingest.ts`**: Replaced stub with real
  `StartIngestionJobCommand` + `GetIngestionJobCommand` SDK calls.

### Removed

- **`infra/lib/vyasa-aoss-stack.ts`**: Deleted — AOSS minimum 2 OCU = ~$350/mo even at zero
  traffic. Replaced by S3 Vectors at ~$0.07/mo.

### Added (Vyasa RAG Service - Phase 8: Deployment)

- **Build configuration fixes:**
  - Created `src/assets/` directory for build assets
  - Added `webpack.config.js` for Lambda bundling
  - Fixed `@orderflow/shared-types` package.json exports
- **Created deployment scripts:**
  - `scripts/populate-kb.sh` - Bedrock Knowledge Base population
  - `DEPLOYMENT.md` - Complete deployment guide
- **Deployment status:**
  - npm install: ✅ Complete
  - Build config: ✅ Complete
  - Infrastructure: ⚠️ Deploy manually via CDK
  - KB population: ⚠️ Run manually

### Added (Vyasa RAG Service - Phase 7: CI/CD)

- `.github/workflows/` - GitHub Actions workflows:
  - `vyasa-rag-ci.yml` - CI pipeline:
    - Lint & type check
    - Unit tests with coverage
    - Build & package Lambda
    - Security scan (npm audit, Snyk)
    - Infrastructure validation (CDK synth/diff)
  - `vyasa-rag-cd.yml` - CD pipeline:
    - Deploy to staging on push to main
    - Run evaluation on staging
    - Deploy to production (manual approval)
    - Smoke tests post-deployment
    - Automatic rollback on failure
    - Slack notifications
  - `vyasa-rag-eval.yml` - Scheduled evaluation:
    - Daily evaluation at 2 AM UTC
    - Golden dataset pass rate checks
    - Slack alerts on low pass rate (< 70%)
    - Results artifact upload

### Added (Vyasa RAG Service - Phase 6: Observability)

- `infra/observability/` - CloudWatch dashboards, alarms, log queries
  - `dashboard.json` - 10 CloudWatch dashboard widgets:
    - Request volume, latency percentiles, error rates
    - Bedrock token usage and latency by operation
    - DynamoDB metrics, rate limiting, agent iterations
    - Live error stream, slow query analysis
  - `alarms.json` - 9 CloudWatch alarms with SNS notifications:
    - Error rate, latency (p99), throttling
    - Bedrock latency, token usage, agent max iterations
    - DynamoDB throttling, circuit breaker, feedback score
  - `log-insights-queries.md` - 12 pre-built queries for:
    - Latency distribution, error analysis, agent performance
    - Token usage, circuit breaker events, rate limiting
  - `src/lib/metrics.ts` - Custom CloudWatch metrics publishing
  - `src/lib/tracer.ts` - X-Ray tracing with annotations

### Added (Vyasa RAG Service - Phase 5: Evaluation System)

- `eval/` - Comprehensive evaluation framework
  - `datasets/golden-dataset.json` - 20 curated test cases (single-hop, multi-hop, complex reasoning, edge cases)
  - `metrics/evaluator.ts` - Evaluation metrics:
    - Accuracy (35%): Keyword overlap with expected answer
    - Citation F1 (20%): Precision/recall of citations
    - Completeness (20%): Coverage of required facts
    - Relevance (15%): Query term presence
    - Conciseness (10%): Answer length appropriateness
  - `runner.ts` - Evaluation execution with HTML/JSON reports
  - `feedback.ts` - Human feedback collection (DynamoDB)
  - `README.md` - Evaluation documentation
  - Pass thresholds by difficulty (Easy: 75%, Medium: 70%, Hard: 65%)

### Added (Vyasa RAG Service - Phase 4: Testing)

- **Test suite** for `vyasa-rag-service`:
  - `test/__mocks__/aws-sdk.ts` - AWS SDK mocks (DynamoDB, Bedrock, S3)
  - `test/unit/` - Unit tests for core services:
    - `agent.spec.ts` - ReAct agent loop tests (7 test cases)
    - `query-planner.spec.ts` - Query decomposition tests (5 test cases)
    - `reflection.spec.ts` - Self-evaluation tests (6 test cases)
    - `context-assembler.spec.ts` - Context filtering tests (5 test cases)
    - `citation-extractor.spec.ts` - Citation deduplication tests (4 test cases)
    - `session-store.spec.ts` - DynamoDB session tests (4 test cases)
    - `validators.spec.ts` - Input validation tests (3 test cases)
    - `circuit-breaker.spec.ts` - Fault tolerance tests (5 test cases)
  - `test/integration/` - Integration tests:
    - `chat-handler.spec.ts` - Handler integration tests
  - `test/contract/` - Contract tests:
    - `openapi.spec.ts` - OpenAPI schema compliance tests
  - `test/fixtures/` - Test fixtures and mock data

### Added (Vyasa RAG Service - Phase 3: Core Implementation)

- `apps/vyasa-rag-service/` - Complete Lambda-based RAG service
  - **Handlers**: `chat.ts`, `chat-stream.ts` (SSE), `health.ts`, `ingest.ts`
  - **Agent Services**: `agent.ts` (ReAct loop), `query-planner.ts` (decomposition), `reflection.ts` (self-evaluation), `context-assembler.ts`, `citation-extractor.ts`
  - **Core Services**: `bedrock-client.ts` (KB + LLM), `session-store.ts` (DynamoDB), `prompt-manager.ts` (S3)
  - **Utilities**: `logger.ts`, `tracer.ts`, `circuit-breaker.ts`, `rate-limiter.ts`, `validators.ts`
  - **Tests**: Unit tests (validators, circuit-breaker), integration tests (chat handler), fixtures
  - **Config**: project.json, tsconfig files, jest.config.ts
  - `CLAUDE.md` - Service documentation

### Added (Vyasa RAG Service - Phase 2: Infrastructure)

- `infra/lib/vyasa-lambda-stack.ts`: CDK infrastructure stack
  - Lambda function (Node.js 22, arm64, 1024MB, streaming enabled)
  - Function URL with CORS for API access
  - DynamoDB tables: sessions (TTL 7 days), rate-limits
  - S3 buckets: corpus (Mahabharata chunks), prompts (versioned)
  - IAM roles with least privilege
  - CloudWatch alarms: error rate, p99 latency, cost budget ($8 threshold)
- `libs/shared-types/src/rag/`: Shared TypeScript types
  - `chat.types.ts`: ChatRequest, ChatResponse, Citation, TokenUsage, AgentStep, SSE events
  - `session.types.ts`: Session, Message, RateLimit types
- `infra/bin/app.ts`: Added VyasaLambdaStack to CDK app

### Added (Vyasa RAG Service - Phase 1: Governance)

- `docs/rfc/004-vyasa-rag-service.md`: RFC for **agentic** serverless RAG service with ReAct loop, query decomposition, and self-reflection
- `docs/adr/010-vyasa-serverless-architecture.md`: ADR documenting Lambda vs ECS, Bedrock KB vs OpenSearch decisions
- `docs/api/vyasa-rag.yaml`: OpenAPI 3.1 spec for chat, streaming, and admin endpoints
- Agentic components in implementation plan:
  - `src/services/agent.ts` - ReAct agent controller
  - `src/services/query-planner.ts` - Query decomposition
  - `src/services/reflection.ts` - Self-reflection evaluator
  - SSE streaming of agent reasoning steps (`thought`, `action`, `observation`, `reflection`)

### Added (AI-Driven Development Infrastructure)

- `.claudeignore`: Prevents Claude from reading build artifacts, reducing token waste per session
- `CLAUDE.md` (root): Project brain — architecture, standards, shared libs, security rules, known
  tech debt; auto-loaded by every Claude session in this repo
- `apps/order-service/CLAUDE.md`: Service-scoped context — domain rules, Prisma schema summary,
  API endpoints, env vars, resilience patterns
- `apps/notification-svc/CLAUDE.md`: Service-scoped context — SQS consumer rules, WebSocket
  events, idempotency rules, local dev commands
- `apps/web/CLAUDE.md`: Frontend context — Angular 18 + NgRx Signal Store patterns, 3-screen
  architecture, API consumption, SCSS standards
- `infra/CLAUDE.md`: CDK context — all 8 stacks, environment config, tagging rules, IAM policy
  standards, known gaps
- `~/.claude/CLAUDE.md`: Updated global rules — Conventional Commits format, branch naming,
  test runner, never-auto-run list, changelog requirement
- `.cloud/permissions.yaml`: Agent guardrails — hard-deny list (force push, cdk destroy, DROP TABLE,
  rm -rf) + allow-with-confirmation list (cdk deploy, prisma migrate deploy)
- `agents/orchestrator/instructions.md`: Orchestrator entry point — 8-step autonomous pipeline
  from ticket parse → design → code → test → changelog → PR
- `agents/design-agent/instructions.md`: Design sub-agent — produces TDD.md with API contract,
  DB schema diff, sequence diagrams, rollback plan
- `agents/code-agent/instructions.md`: Code sub-agent — TDD red/green/refactor loop, enforces
  project standards, lints and tests before finishing
- `agents/test-agent/instructions.md`: Test sub-agent — coverage gap analysis, writes additional
  unit tests to reach 80% threshold
- `agents/deploy-agent/instructions.md`: Deploy sub-agent — commits, pushes, opens PR via GitHub
  MCP with filled PR template; uses claude-haiku for cost efficiency
- `hooks/pre-tool.sh`: Pre-tool hook — secret pattern detection, blocks force push / cdk destroy /
  migrate reset / .env writes, writes audit trail to `.cloud/audit.log`
- `hooks/post-tool.sh`: Post-tool hook — auto-lints written TypeScript files, warns on .env
  modification, appends to audit log
- `skills/create-test-file/skill.md`: Reusable Jest test template with AWS SDK mocks, Prisma
  mocks, AAA pattern, naming conventions
- `skills/generate-prisma-migration/skill.md`: Safe migration workflow — additive-only rules,
  step-by-step process, rollback SQL generation
- `skills/update-changelog/skill.md`: Keep a Changelog format guide with OrderFlow-specific
  conventions and per-service grouping examples
- `skills/open-pr/skill.md`: PR opening guide using GitHub MCP with title format, body template,
  and label conventions
- `.mcp.json`: MCP server configuration for github, aws-unified, jira, slack (uses env vars —
  no secrets hardcoded)
- `.github/workflows/llm-security-scan.yml`: LLM security review via AWS Bedrock on every PR —
  Claude Sonnet reviews TypeScript/JS diff for OWASP Top 10, posts inline PR comments,
  fails on HIGH/CRITICAL findings; uses OIDC auth (no long-lived keys)
- `scripts/ai-dev.sh`: Operator script — fetches Jira ticket, runs orchestrator headlessly;
  single command: `./scripts/ai-dev.sh JIRA-456`
- `docs/AI_DRIVEN_DEV_SETUP_PLAN.md`: Full setup plan with status tracking checklist

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
