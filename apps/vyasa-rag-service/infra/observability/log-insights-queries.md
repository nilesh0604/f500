# CloudWatch Log Insights Queries

## Common Queries for Vyasa RAG Operations

### 1. Request Latency Distribution

```sql
fields @timestamp, @message
| parse @message '*latency*: *ms*' as _, latency
| filter ispresent(latency)
| stats
    count() as requests,
    avg(latency) as avg_latency,
    pct(latency, 50) as p50,
    pct(latency, 90) as p90,
    pct(latency, 99) as p99,
    max(latency) as max_latency
  by bin(5m)
| sort @timestamp desc
```

### 2. Error Analysis

```sql
fields @timestamp, @message, @logStream
| filter @message like /ERROR/ or @message like /Exception/ or @message like /error/
| parse @message '*error*: *' as _, error_message
| stats
    count() as error_count,
    earliest(@timestamp) as first_seen,
    latest(@timestamp) as last_seen
  by error_message
| sort error_count desc
| limit 20
```

### 3. Agent Loop Performance

```sql
fields @timestamp, @message
| parse @message '*iterations*: *' as _, iterations
| filter ispresent(iterations)
| parse @message '*query*: "*"' as _, query
| stats
    count() as total_queries,
    avg(iterations) as avg_iterations,
    max(iterations) as max_iterations,
    pct(iterations, 95) as p95_iterations
  by bin(1h)
| sort @timestamp desc
```

### 4. Token Usage by Hour

```sql
fields @timestamp, @message
| parse @message '*input_tokens*: *, *output_tokens*: *' as input_tokens, output_tokens
| filter ispresent(input_tokens)
| stats
    sum(input_tokens) as total_input,
    sum(output_tokens) as total_output,
    sum(input_tokens + output_tokens) as total_tokens,
    avg(input_tokens + output_tokens) as avg_per_request
  by bin(1h)
| sort @timestamp desc
```

### 5. Circuit Breaker Events

```sql
fields @timestamp, @message
| filter @message like /circuit breaker/ or @message like /CircuitBreaker/
| parse @message '*state*: *' as _, state
| stats
    count() as event_count
  by state, bin(1h)
| sort @timestamp desc
```

### 6. Top Slow Queries

```sql
fields @timestamp, @message
| parse @message '*latency*: *ms*, *query*: "*"' as _, latency, _, query
| filter ispresent(query) and latency > 3000
| stats
    count() as occurrences,
    max(latency) as max_latency,
    avg(latency) as avg_latency,
    pct(latency, 95) as p95_latency
  by query
| sort max_latency desc
| limit 10
```

### 7. Rate Limiting Analysis

```sql
fields @timestamp, @message
| filter @message like /rate limit/ or @message like /RateLimit/
| parse @message '*client_ip*: *,' as _, client_ip
| stats
    count() as rejected_requests
  by client_ip, bin(5m)
| sort rejected_requests desc
| limit 20
```

### 8. Session Activity

```sql
fields @timestamp, @message
| filter @message like /session/
| parse @message '*session_id*: *, *messages*: *' as session_id, message_count
| stats
    count() as total_sessions,
    avg(message_count) as avg_messages,
    max(message_count) as max_messages
  by bin(1h)
| sort @timestamp desc
```

### 9. Bedrock API Errors

```sql
fields @timestamp, @message
| filter @message like /Bedrock/ and (@message like /error/ or @message like /Error/)
| parse @message '*operation*: *' as _, operation
| stats
    count() as error_count,
    earliest(@timestamp) as first_seen
  by operation
| sort error_count desc
| limit 10
```

### 10. Feedback Summary

```sql
fields @timestamp, @message
| filter @message like /feedback/
| parse @message '*rating*: *, *helpful*: *' as rating, helpful
| stats
    count() as total_feedback,
    avg(rating) as avg_rating,
    count(helpful = true) as helpful_count,
    count(helpful = false) as not_helpful_count
  by bin(1d)
| sort @timestamp desc
```

### 11. Query Type Distribution

```sql
fields @timestamp, @message
| parse @message '*query*: "*"' as _, query
| filter ispresent(query)
| stats count() as count by query
| sort count desc
| limit 20
```

### 12. Citation Quality Analysis

```sql
fields @timestamp, @message
| parse @message '*citations*: *' as _, citation_count
| filter ispresent(citation_count)
| stats
    count() as responses,
    avg(citation_count) as avg_citations,
    pct(citation_count, 95) as p95_citations
  by bin(1h)
| sort @timestamp desc
```

## Saved Queries

Save these queries in CloudWatch for quick access:

1. **Request Performance** - Query #1
2. **Error Tracking** - Query #2
3. **Token Usage** - Query #4
4. **Slow Queries** - Query #6

## Dashboard Integration

Use these queries in CloudWatch Dashboard widgets:

```json
{
  "type": "log",
  "properties": {
    "query": "SOURCE '/aws/lambda/vyasa-rag-service' | fields @timestamp, @message...",
    "region": "us-east-1",
    "title": "Request Latency",
    "logGroupNames": ["/aws/lambda/vyasa-rag-service"]
  }
}
```
