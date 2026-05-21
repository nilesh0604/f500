# CLAUDE.md — order-service

## Responsibility

Handles all order management (CRUD) and user authentication (register/login/delete).
Owner: platform-team | Port: 3001

---

## Domain Rules

### Orders

- Status flow (strict): `pending` → `confirmed` → `shipped` → `delivered` (or `cancelled` from any state)
- YOU MUST write an `OrderAudit` record on every status change (who, fromStatus, toStatus, timestamp)
- Idempotency key (`X-Idempotency-Key` header) required on `POST /v1/orders` — check before creating
- All `quantity` values must be positive integers
- Cursor-based pagination only — never offset pagination

### Authentication

- Passwords: bcrypt cost factor 12, max 72 chars
- JWT: RS256 — access token 15 min, refresh token 7 days
- Email stored as hash (`emailHash`) — never store raw email
- GDPR: `consentTimestamp` required on register; `DELETE /v1/auth/me` implements right-to-deletion (soft delete — set `deletedAt`, hash email with random salt)

### Events Published (EventBridge bus: `orderflow-event-bus`)

- `orderflow.order.created` — on new order
- `orderflow.order.status_changed` — on every status update
- Event envelope: `{ source, type, correlationId, timestamp, data, version }` — use `@orderflow/event-schemas` builder

---

## Tech Stack

- Express 4.x + TypeScript strict
- Prisma 5.x + PostgreSQL (schema: `prisma/schema.prisma`)
- AWS SDK v3: `@aws-sdk/client-eventbridge` (publish), `@aws-sdk/client-secrets-manager` (secrets)
- Redis (`redis` client) for response caching — TTL 30s on `GET /v1/orders`
- OpenTelemetry tracing via `@orderflow/logger` (`initTracing('order-service')`)

---

## Database Schema (Prisma)

Models: `User`, `Order`, `OrderAudit`

```
User     { id, emailHash, passwordHash, consentTimestamp, createdAt, updatedAt, deletedAt }
Order    { id, userId, itemName, quantity, notes, status, idempotencyKey, createdAt, updatedAt }
OrderAudit { id, orderId, userId, action, fromStatus, toStatus, timestamp }
```

Migrations location: `prisma/migrations/`

```bash
# Create new migration
npx prisma migrate dev --name describe_change

# Apply migrations (staging/prod)
npx prisma migrate deploy

# Generate Prisma client after schema change
npx prisma generate
```

**IMPORTANT: Never use `DROP TABLE` or `DROP COLUMN` in migrations without human approval.**

---

## API Endpoints

```
POST   /v1/auth/register          Register user (email, password, consentTimestamp)
POST   /v1/auth/login             Login (returns accessToken + refreshToken)
DELETE /v1/auth/me                GDPR right-to-deletion (auth required)

POST   /v1/orders                 Create order (auth + idempotency key required)
GET    /v1/orders                 List user orders (cursor pagination, status filter)
GET    /v1/orders/:id             Order detail
PATCH  /v1/orders/:id/status      Update order status

GET    /health                    Liveness probe
GET    /ready                     Readiness probe (checks DB + Redis)
```

---

## Source Structure

```
src/
  app/
    db/           prisma.client.ts (connection pool: limit=20)
    events/       event.publisher.ts (EventBridge + circuit breaker)
    middleware/   auth, cache, resilience, security, validation, red-metrics
    routes/       auth.router.ts, orders.router.ts, health.router.ts
    services/     auth.service.ts, order.service.ts
    validation/   auth.schemas.ts, order.schemas.ts (Zod)
  main.ts         initTracing('order-service') called BEFORE any imports
  types/          compression.d.ts shim
```

---

## Local Dev

```bash
# Start dependencies
docker compose up -d postgres redis localstack

# Run dev server (hot-reload)
npx nx serve order-service

# Run unit tests
npx nx test order-service

# Run integration tests (needs Docker)
npx nx test order-service --configuration=integration

# Env file
cp .env.example .env
```

Required env vars: `DATABASE_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `AWS_REGION`,
`EVENT_BUS_NAME`, `LOCALSTACK_ENDPOINT`, `CORS_ORIGIN`

---

## Resilience Patterns Already Implemented

- Circuit breaker on EventBridge publish (`opossum` — 50% failure rate → open, resets 10s)
- Retry with exponential backoff + ±25% jitter (3 attempts, 200ms base, 5s timeout)
- Redis cache with graceful degradation (falls back to DB if Redis unavailable)
- Connection pool: `connection_limit=20`, `pool_timeout=10`
