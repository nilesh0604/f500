# CLAUDE.md — notification-svc

## Responsibility

Consumes order events from SQS and pushes real-time notifications to connected clients via Socket.IO WebSocket.
Owner: platform-team | Port: 3002

---

## Domain Rules

- This service has NO database — it is stateless except for Redis (WebSocket adapter)
- Idempotency: deduplicate messages by SQS `MessageId` — never process the same message twice
- On max retries (`maxReceiveCount=3`): message passes to DLQ automatically — do NOT delete manually
- Per-message processing timeout: 5 seconds via `Promise.race` — on timeout, delete message with `warn` log (avoids DLQ churn)
- Never emit sensitive PII over WebSocket — only `orderId`, `status`, `timestamp`, `correlationId`

---

## Events Consumed (SQS queue: `orderflow-notifications`)

| Event type                       | Source        | Action                                               |
| -------------------------------- | ------------- | ---------------------------------------------------- |
| `orderflow.order.created`        | order-service | Emit `order:created` to user's Socket.IO room        |
| `orderflow.order.status_changed` | order-service | Emit `order:status_changed` to user's Socket.IO room |

Event envelope validation: always use `@orderflow/event-schemas` Zod validator before processing.

---

## Tech Stack

- Express 4.x + TypeScript strict (health endpoints only — no business API)
- Socket.IO 4.x with Redis adapter (ElastiCache Redis in prod, local Redis in dev)
- AWS SDK v3: `@aws-sdk/client-sqs` (long-poll consumer)
- OpenTelemetry tracing via `@orderflow/logger` (`initTracing('notification-svc')`)
- No Prisma — no database

---

## Source Structure

```
src/
  app/
    consumers/    sqs.consumer.ts (long-poll loop, idempotency, timeout guard)
    events/       event.handlers.ts (route event type → Socket.IO emit)
    routes/       health.router.ts
    websocket/    socket.server.ts (Socket.IO setup, room management, JWT auth)
  main.ts         initTracing('notification-svc') called BEFORE any imports
```

---

## API Endpoints

```
GET /health   Liveness probe
GET /ready    Readiness probe (checks SQS reachability + Redis connection)
```

No business REST API — all real-time communication is via WebSocket.

---

## WebSocket Events

```
Client → Server:
  authenticate   { token: string }   Join user-specific room after JWT verification

Server → Client:
  order:created          { orderId, status, timestamp, correlationId }
  order:status_changed   { orderId, fromStatus, toStatus, timestamp, correlationId }
```

---

## Local Dev

```bash
# Start dependencies
docker compose up -d redis localstack

# Run dev server
npx nx serve notification-svc

# Run unit tests
npx nx test notification-svc

# Env file
cp .env.example .env
```

Required env vars: `AWS_REGION`, `SQS_QUEUE_URL`, `LOCALSTACK_ENDPOINT`, `CORS_ORIGIN`
Redis connection: inherited from environment (no separate env var in dev — uses default localhost:6379)

---

## Resilience Patterns Already Implemented

- SQS long-poll (20s wait time) with automatic visibility timeout extension
- Per-message 5s processing timeout
- Graceful shutdown: drain in-flight SQS messages, close Socket.IO connections, then exit
- Auto-reconnect for Socket.IO clients (5 attempts, exponential backoff)
