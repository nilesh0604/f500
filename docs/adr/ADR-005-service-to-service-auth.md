# ADR-005: Service-to-Service Authentication

## Status

Accepted

## Context

In a microservices architecture, services need to authenticate with each other and verify the authenticity of events they receive.

Options considered:

1. **Shared secrets**: API keys stored in environment variables
2. **mTLS**: Mutual TLS certificates between services
3. **AWS IAM Task Roles**: ECS task roles for service identity
4. **JWT with service claims**: Service-to-service JWTs

## Decision

We will use **AWS IAM Task Roles** for AWS service authentication and **event envelope signing** for event verification.

### AWS Service Calls (SQS, EventBridge, Secrets Manager)

- ECS Task IAM Roles with least privilege
- No shared credentials or API keys
- AWS SDK automatically handles credential rotation

### Inter-Service HTTP (if needed)

- Internal ALB with security groups (no direct service-to-service HTTP for this architecture)
- Events preferred over HTTP calls

### Event Verification

- Event envelope contains `source` field (verified by convention)
- Correlation ID propagated for tracing
- SQS queue access controlled by IAM

## Consequences

### Positive

- **No secrets in code**: IAM roles are infrastructure, not application secrets
- **Automatic rotation**: AWS handles credential rotation
- **Auditability**: CloudTrail logs all IAM-based access
- **Least privilege**: Each service has minimal required permissions
- **No key management**: No need to distribute or rotate API keys

### Negative

- **AWS lock-in**: Tied to AWS IAM (acceptable for this project)
- **Debugging**: IAM issues can be cryptic to debug
- **Local development**: Requires AWS credentials or moto/localstack

### Mitigations

- Clear IAM policy documentation
- IAM policy tests in CDK
- LocalStack for local development
- Structured logging for authentication failures

## IAM Role Structure

```
OrderServiceTaskRole:
  - rds-db:connect (OrderServiceDB)
  - events:PutEvents (EventBus)
  - secretsmanager:GetSecret (DB credentials)

NotificationServiceTaskRole:
  - sqs:ReceiveMessage, DeleteMessage, GetQueueAttributes
  - elasticache:Connect
  - secretsmanager:GetSecret (Redis credentials)
```

## Event Security

Event messages include:

- `source`: Verified service identifier
- `correlationId`: For request tracing
- `timestamp`: For replay detection

Access to queues is IAM-controlled, not message-level authentication.

## Related Decisions

- ADR-002: Event-Driven Architecture (events are the primary communication)
- ADR-003: Database per Service (IAM controls DB access)

## Date

2024-11-XX

## Author

OrderFlow Architecture Team
