# ADR-006: Observability Strategy

## Status

Accepted

## Context

We need to observe and debug a distributed system with:

- 2 microservices
- Event-driven communication
- Database and cache dependencies
- Frontend client

Options considered for each observability pillar:

**Logs:**

1. CloudWatch Logs (native AWS)
2. Third-party (Datadog, Splunk)

**Metrics:**

1. CloudWatch Metrics
2. Prometheus + Grafana

**Traces:**

1. AWS X-Ray
2. OpenTelemetry with third-party collector

## Decision

We will use a **hybrid AWS-native + OpenTelemetry approach**:

| Pillar  | Technology                           |
| ------- | ------------------------------------ |
| Logs    | CloudWatch Logs with structured JSON |
| Metrics | CloudWatch Metrics + Alarms          |
| Traces  | AWS X-Ray with OpenTelemetry SDK     |

## Consequences

### Positive

- **Integrated**: Native AWS integration with ECS, Lambda, ALB
- **Cost**: No additional third-party costs
- **Correlation**: X-Ray trace to CloudWatch Logs correlation
- **Standards**: OpenTelemetry provides vendor-neutral instrumentation
- **Learning**: Industry-standard observability stack

### Negative

- **AWS coupling**: CloudWatch and X-Ray are AWS-specific
- **Query limitations**: CloudWatch Logs Insights has query limitations
- **Retention**: Log retention costs for long-term storage

### Mitigations

- OpenTelemetry SDK allows future migration if needed
- Log retention policies (30 days hot, 90 days cold in S3)
- Structured logging for queryability

## Implementation

### Logging (Pino + CloudWatch)

```typescript
{
  "level": "info",
  "message": "Order created",
  "correlationId": "req-12345",
  "service": "order-service",
  "timestamp": "2024-11-15T10:30:00Z",
  "orderId": "order-abc",
  "userId": "user-xyz"
}
```

### Metrics (CloudWatch)

- **RED metrics**: Request rate, Error rate, Duration
- **Business metrics**: Orders per minute, revenue
- **Infrastructure**: CPU, memory, DB connections

### Tracing (X-Ray + OpenTelemetry)

- Automatic HTTP instrumentation
- Manual span annotation for business operations
- 5% sampling rate (100% on errors)
- Correlation ID propagation

## Correlation ID Propagation

```
Frontend -> ALB -> Order Service -> EventBridge -> SQS -> Notification Service
   |           |          |           |          |            |
   └-----------┴----------┴-----------┴----------┴------------┘
                    Same Correlation ID
```

## Alerting Strategy

| Severity | Response | Channel           | Example             |
| -------- | -------- | ----------------- | ------------------- |
| P1       | 5 min    | PagerDuty + Phone | Service down        |
| P2       | 15 min   | PagerDuty + Slack | Error rate > 1%     |
| P3       | 1 hour   | Slack             | Latency degradation |
| P4       | Next day | Email             | Disk usage > 70%    |

## SLOs (Service Level Objectives)

- Availability: 99.9%
- Latency p95: < 200ms
- Error rate: < 0.1%

## Related Decisions

- ADR-002: Event-Driven Architecture (trace events through system)
- ADR-007: Authentication Approach (log auth events)

## Date

2024-11-XX

## Author

OrderFlow Architecture Team
