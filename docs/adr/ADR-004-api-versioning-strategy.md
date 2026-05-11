# ADR-004: API Versioning Strategy

## Status

Accepted

## Context

We need a strategy for evolving our public APIs over time without breaking existing clients.

Options considered:

1. **URL versioning**: `/v1/orders`, `/v2/orders`
2. **Header versioning**: `Accept: application/vnd.orderflow.v1+json`
3. **Query parameter**: `/orders?version=1`
4. **No versioning**: Always backward compatible

## Decision

We will use **URL path-based versioning**: `/v1/orders`, `/v1/auth/login`

## Consequences

### Positive

- **Explicit**: Version is visible in the URL, easy to understand
- **Cache-friendly**: Different versions cache independently
- **Testing**: Easy to test different versions side-by-side
- **Documentation**: Clear separation in OpenAPI specs
- **Industry standard**: Used by most major APIs (AWS, Stripe, GitHub)

### Negative

- **URL pollution**: Version in every endpoint
- **Breaking changes**: Still require careful management
- **Multiple versions**: May need to maintain multiple code paths

### Mitigations

- Strict backward compatibility rules within a version
- Deprecation headers for old versions
- Automated contract testing between versions

## Versioning Rules

### Within a Version (Non-Breaking)

Allowed:

- Adding new endpoints
- Adding optional request fields
- Adding response fields
- Adding enum values

Not Allowed:

- Removing fields
- Changing field types
- Making optional fields required
- Changing error response structure

### New Version (Breaking)

When breaking changes are required:

1. Create new version (e.g., `/v2/orders`)
2. Support old version for minimum 6 months
3. Deprecation headers on old version
4. Migration guide for clients

## Implementation

```
/v1/auth/register     POST   - User registration
/v1/auth/login        POST   - User login
/v1/orders            GET    - List orders
/v1/orders            POST   - Create order
/v1/orders/:id        GET    - Get order
/v1/orders/:id/status PATCH  - Update order status
```

## OpenAPI Spec Organization

```
docs/api/
├── v1/
│   ├── orders.openapi.yaml
│   ├── auth.openapi.yaml
│   └── combined.openapi.yaml
└── async/
    └── events.asyncapi.yaml
```

## Related Decisions

- ADR-001: Monorepo Strategy (versioned specs in shared location)
- ADR-002: Event-Driven Architecture (event versioning follows same principles)

## Date

2024-11-XX

## Author

OrderFlow Architecture Team
