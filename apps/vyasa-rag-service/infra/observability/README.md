# Vyasa RAG Observability

## Overview

Comprehensive observability stack for monitoring, alerting, and debugging the Vyasa RAG service.

## Components

| Component                  | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `dashboard.json`           | CloudWatch dashboard widget definitions    |
| `alarms.json`              | CloudWatch alarm configurations            |
| `log-insights-queries.md`  | Pre-built CloudWatch Logs Insights queries |
| `../../src/lib/metrics.ts` | Custom metrics publishing                  |
| `../../src/lib/tracer.ts`  | X-Ray tracing annotations                  |

## CloudWatch Dashboard

**Widgets:**

- **Request Volume** - API Gateway request counts
- **Latency (p50, p90, p99)** - Lambda duration percentiles
- **Error Rate** - Lambda errors and throttles
- **Bedrock Token Usage** - Input/output token consumption
- **Bedrock Latency** - Operation-level latency breakdown
- **DynamoDB Metrics** - Read/write capacity and throttling
- **Rate Limiting** - Rejected request tracking
- **Agent Iterations** - Distribution of agent loop iterations
- **Recent Errors** - Live error log stream
- **Top Slow Queries** - High-latency query analysis

**Import Dashboard:**

```bash
aws cloudwatch put-dashboard \
  --dashboard-name VyasaRAG-Production \
  --dashboard-body file://infra/observability/dashboard.json
```

## Alarms

| Alarm                            | Threshold            | Action    |
| -------------------------------- | -------------------- | --------- |
| `vyasa-rag-high-error-rate`      | >5 errors in 5 min   | SNS Alert |
| `vyasa-rag-high-latency-p99`     | p99 > 5 seconds      | SNS Alert |
| `vyasa-rag-throttling`           | Any throttling       | SNS Alert |
| `vyasa-rag-bedrock-high-latency` | p90 > 4 seconds      | SNS Alert |
| `vyasa-rag-high-token-usage`     | >50K tokens/5min     | SNS Alert |
| `vyasa-rag-agent-max-iterations` | Max iterations hit   | SNS Alert |
| `vyasa-rag-dynamodb-throttling`  | Any throttling       | SNS Alert |
| `vyasa-rag-circuit-breaker-open` | Circuit breaker open | SNS Alert |
| `vyasa-rag-low-feedback-score`   | Avg rating < 3.5     | SNS Alert |

**Create Alarms:**

```bash
# Use CDK or AWS CLI to create alarms from alarms.json
# Or deploy via vyasa-lambda-stack.ts
```

## Custom Metrics

Published via `src/lib/metrics.ts`:

| Metric                | Namespace | Dimensions |
| --------------------- | --------- | ---------- |
| `BedrockInputTokens`  | VyasaRAG  | Operation  |
| `BedrockOutputTokens` | VyasaRAG  | Operation  |
| `BedrockLatency`      | VyasaRAG  | Operation  |
| `AgentIterations`     | VyasaRAG  | QueryType  |
| `RateLimitRejected`   | VyasaRAG  | Type       |
| `CircuitBreakerOpen`  | VyasaRAG  | Service    |
| `FeedbackRating`      | VyasaRAG  | -          |
| `CitationCount`       | VyasaRAG  | -          |

**Publish Metrics:**

```typescript
import { publishTokenMetrics, publishAgentIterations } from './lib/metrics';

await publishTokenMetrics(1000, 500, 'Generate');
await publishAgentIterations(2, query);
```

## X-Ray Tracing

**Annotations** (indexed for search):

- `agent_step` - Current step number
- `agent_type` - Step type (thought/action/observation)
- `input_tokens` / `output_tokens` - Token counts
- `retrieval_results` - Number of retrieved documents
- `answer_length` - Response character count
- `citation_count` - Number of citations
- `agent_iterations` - Total iterations
- `passed_reflection` - Reflection result

**Metadata** (not indexed):

- `query_preview` - First 100 chars of query
- `subquery_count` - Decomposed query count
- `retrieval_top_score` - Best retrieval score
- `model_id` - Bedrock model used

**Service Map:**

```
Client → API Gateway → Lambda → Bedrock
              ↓           ↓
         CloudWatch   DynamoDB
              ↓           ↓
            X-Ray     S3
```

## Log Insights Queries

See `log-insights-queries.md` for 12 pre-built queries:

1. **Request Latency Distribution** - Percentile breakdown
2. **Error Analysis** - Error frequency by message
3. **Agent Loop Performance** - Iteration statistics
4. **Token Usage by Hour** - Consumption patterns
5. **Circuit Breaker Events** - State changes
6. **Top Slow Queries** - Performance bottlenecks
7. **Rate Limiting Analysis** - Rejected requests
8. **Session Activity** - User engagement
9. **Bedrock API Errors** - External service issues
10. **Feedback Summary** - User satisfaction
11. **Query Type Distribution** - Traffic patterns
12. **Citation Quality Analysis** - Source coverage

**Run Query:**

```bash
aws logs start-query \
  --log-group-name /aws/lambda/vyasa-rag-service \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --end-time $(date +%s)000 \
  --query-string "fields @timestamp, @message | limit 20"
```

## Correlation IDs

All logs include:

- `correlationId` - Request trace ID
- `sessionId` - User session identifier
- `AWS X-Ray trace_id` - Distributed trace ID

**Search by Correlation ID:**

```sql
fields @timestamp, @message
| filter correlationId = '550e8400-e29b-41d4-a716-446655440000'
| sort @timestamp asc
```

## Cost Monitoring

**Estimated Costs:**

- CloudWatch Logs: ~$0.50/GB ingested
- CloudWatch Metrics: ~$0.01/custom metric
- X-Ray Tracing: ~$5.00/million traces
- Dashboards: $3.00/dashboard/month

**Total: ~$5-10/month** for full observability

## Troubleshooting

### High Latency

1. Check `BedrockLatency` metric
2. Review slow queries in Log Insights
3. Verify agent iteration count

### Errors

1. Check dashboard Error Rate widget
2. Run Error Analysis query
3. Review X-Ray traces for failed segments

### Cost Spikes

1. Monitor `BedrockTotalTokens` metric
2. Check for runaway agent iterations
3. Review rate limiting rejections

## Integration with CDK

Dashboard and alarms are created in `vyasa-lambda-stack.ts`:

```typescript
// Create CloudWatch Dashboard
const dashboard = new cloudwatch.Dashboard(this, 'VyasaRagDashboard', {
  dashboardName: `${props.environment}-vyasa-rag`,
});

// Add widgets from dashboard.json
dashboard.addWidgets(...);

// Create alarms
new cloudwatch.Alarm(this, 'HighErrorRate', {
  metric: lambdaFunction.metricErrors(),
  threshold: 5,
  evaluationPeriods: 5,
});
```
