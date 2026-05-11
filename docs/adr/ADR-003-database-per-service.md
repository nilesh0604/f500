# ADR-003: Database per Service Pattern

## Status

Accepted

## Context

We have two services with different data needs:

- **Order Service**: Persistent transactional data (orders, users) - PostgreSQL
- **Notification Service**: Ephemeral session data (WebSocket connections, temporary state) - Redis

Options considered:

1. **Shared database**: Both services connect to same PostgreSQL
2. **Database per service**: Each service owns its data store
3. **Schema per service**: Same database, separate schemas

## Decision

We will implement **database per service** with:

- **Order Service**: Amazon RDS PostgreSQL (persistent data)
- **Notification Service**: Amazon ElastiCache Redis (session/cache data)

Each service owns its data and schema. No direct database access between services.

## Consequences

### Positive

- **Service independence**: Can change database technology per service
- **Encapsulation**: Data access only through service API
- **Scaling**: Scale databases independently based on load patterns
- **Failure isolation**: Database issues don't cascade across services
- **Team autonomy**: Teams can optimize their own data layer

### Negative

- **Data consistency**: Cross-service data consistency requires choreography/saga
- **Complexity**: Multiple database systems to manage
- **Reporting**: Cross-service reporting requires API aggregation
- **Transactions**: No ACID transactions across services

### Mitigations

- Event-driven eventual consistency for cross-service state
- CQRS pattern for complex read scenarios
- Data replication via events for read models
- Distributed tracing for debugging cross-service flows

## Data Ownership

| Service              | Database            | Data Owned                      |
| -------------------- | ------------------- | ------------------------------- |
| Order Service        | PostgreSQL (RDS)    | Orders, Users, Audit Logs       |
| Notification Service | Redis (ElastiCache) | WebSocket sessions, Rate limits |

## Data Access Rules

1. Services may only access their own database
2. Cross-service data needs go through APIs or events
3. Read replicas documented but not deployed (learning scope)

## Related Decisions

- ADR-002: Event-Driven Architecture (events for cross-service data sync)
- ADR-005: Service-to-Service Auth (protects data access)

## Date

2024-11-XX

## Author

OrderFlow Architecture Team
