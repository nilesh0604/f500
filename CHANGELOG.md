# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
