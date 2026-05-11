# ADR-002: Event-Driven Architecture with AWS EventBridge and SQS

## Status

Accepted

## Context

OrderFlow requires communication between:

- Order Service (creates/manages orders)
- Notification Service (sends real-time updates)

When an order is created or its status changes, the Notification Service must be informed to push updates to connected clients via WebSocket.

Options considered:

1. **Synchronous HTTP calls**: Order Service calls Notification Service directly
2. **Database polling**: Notification Service polls database for changes
3. **Event-driven**: Order Service publishes events, Notification Service consumes

## Decision

We will implement **event-driven architecture** using:

- **AWS EventBridge**: Event bus for routing
- **AWS SQS**: Queue for reliable delivery to Notification Service
- **Dead Letter Queue (DLQ)**: For failed message handling

```
Order Service -> EventBridge -> SQS -> Notification Service
                     |
                     v
                    DLQ (for failures)
```

## Consequences

### Positive

- **Decoupling**: Services don't know about each other, only event contracts
- **Resilience**: Notification Service down? Events accumulate in SQS
- **Scalability**: Can add new consumers without changing Order Service
- **Auditability**: Event history in EventBridge
- **Async processing**: Order Service not blocked by notification delivery
- **Future extensibility**: Easy to add new event consumers (analytics, audit log)

### Negative

- **Complexity**: More infrastructure components to manage
- **Eventual consistency**: State changes are not immediately visible everywhere
- **Debugging difficulty**: Tracing a request through events is harder
- **Contract management**: Events are a public API, changes require versioning

### Mitigations

- Event envelope schema with correlation IDs for tracing
- Structured logging with event context
- Dead letter queue monitoring and alerts
- Event schema validation before publishing
- Idempotency handling in consumers

## Event Schema (Envelope)

```json
{
  "specversion": "1.0",
  "type": "order.created",
  "source": "orderflow/order-service",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "time": "2024-11-15T10:30:00Z",
  "correlationId": "req-12345",
  "data": {
    "orderId": "order-abc",
    "userId": "user-xyz",
    "status": "pending",
    "items": [...]
  }
}
```

## Event Types

- `order.created`: New order created
- `order.status_changed`: Order status transition
- `order.cancelled`: Order cancelled

## Related Decisions

- ADR-003: Database per Service (services own their data)
- ADR-006: Observability Strategy (correlation ID propagation)

## Date

2024-11-XX

## Author

OrderFlow Architecture Team
