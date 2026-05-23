# ADR-010: Vyasa Serverless Architecture

## Status

Proposed

## Context

We need to implement the Vyasa Intelligence RAG Service as specified in RFC-004 and the Implementation Plan. The service must:

- Answer questions about the Mahabharata with accurate citations
- Support multi-turn conversations with session persistence
- Stream responses via SSE
- Operate at minimal cost (~$3-5/month for 100 visits)
- Meet Fortune 500 SDLC standards

We need to make key architectural decisions about:

1. Compute platform (ECS vs Lambda)
2. Vector database (OpenSearch vs Bedrock Knowledge Base)
3. API gateway (API Gateway vs Lambda Function URL)
4. Session store (ElastiCache vs DynamoDB)

## Decision

We will use a **serverless Lambda architecture** with the following components:

1. **AWS Lambda** (Node.js 22, arm64, 1024MB) with Function URL
2. **Amazon Bedrock Knowledge Base** (vector store + Titan V2 embeddings)
3. **Amazon DynamoDB** (session store, on-demand billing)
4. **Amazon S3** (corpus storage, versioned prompts)

## Consequences

### Positive

- **Cost efficiency**: ~$3-5/month vs ~$200/month for ECS Fargate + OpenSearch
- **Scale to zero**: No charges when not in use
- **Managed services**: Bedrock KB eliminates vector database management
- **Serverless sessions**: DynamoDB on-demand scales with traffic
- **Faster time to market**: Less infrastructure to manage

### Negative

- **Cold starts**: ~500ms initial latency (mitigated with 1024MB memory)
- **Vector search latency**: ~200-500ms vs ~50ms for OpenSearch
- **Session latency**: DynamoDB ~10-20ms vs Redis ~1ms
- **Limited local dev**: Lambda runtime differs from local Node.js

### Mitigations

- Use 1024MB Lambda memory (reduces cold start time)
- Implement circuit breaker for Bedrock throttling
- Cache prompts in memory with 5-minute TTL
- Provide Docker setup for local integration testing

## Alternatives Considered

### ECS Fargate + OpenSearch

**Pros**:

- Lower latency for vector search (~50ms)
- Persistent connections to Redis for sessions
- Easier local development

**Cons**:

- Minimum $150-200/month cost
- Must manage OpenSearch cluster
- No scale-to-zero (always charged)

**Decision**: Rejected due to cost for low-traffic use case.

### API Gateway + Lambda

**Pros**:

- Built-in rate limiting
- Request validation
- API key management
- Usage plans and throttling

**Cons**:

- $3-5/month additional cost
- Added latency (~10-20ms)
- Unnecessary for internal/personal use

**Decision**: Rejected in favor of Function URL for cost optimization.

### ElastiCache (Redis) for Sessions

**Pros**:

- Sub-millisecond latency
- Rich data structures
- Pub/sub capabilities

**Cons**:

- $15-20/month minimum
- Requires VPC configuration
- No serverless option (always-on nodes)

**Decision**: Rejected in favor of DynamoDB on-demand.

## Trade-off Analysis

| Factor                | ECS Fargate | Lambda (Selected) |
| --------------------- | ----------- | ----------------- |
| Monthly Cost          | ~$200       | ~$3-5             |
| Cold Start            | N/A         | ~500ms            |
| Scale to Zero         | No          | Yes               |
| Vector Search Latency | ~50ms       | ~200-500ms        |
| Session Latency       | ~1ms        | ~10-20ms          |
| Operational Burden    | High        | Low               |

## Implementation Details

### Lambda Configuration

- **Runtime**: Node.js 22.x
- **Architecture**: arm64 (20% cheaper, better performance)
- **Memory**: 1024MB (sweet spot for Bedrock latency)
- **Timeout**: 30 seconds
- **Reserved concurrency**: Not configured (use if cold starts problematic)

### Bedrock Knowledge Base

- **Embeddings**: Amazon Titan Text Embeddings V2 (1024-dim)
- **LLM**: Claude 3 Haiku (fast, cost-effective)
- **Data source**: S3 corpus bucket
- **Vector index**: AWS-managed default (OPENSEARCH_SERVERLESS via Bedrock KB — no standing cost)

### DynamoDB

- **Billing**: On-demand (pay-per-request)
- **TTL**: 7 days for sessions
- **Capacity**: Auto-scaling

### Function URL

- **Auth**: AWS_IAM (for admin) or NONE (for public chat)
- **CORS**: Enabled for web clients
- **Invoke mode**: RESPONSE_STREAM (for SSE)

## Security Considerations

- IAM roles with least privilege
- Secrets in AWS Secrets Manager
- Input validation via Zod schemas
- Rate limiting at application layer
- No sensitive data in logs

## Cost Breakdown

| Component      | Service               | Monthly Cost    |
| -------------- | --------------------- | --------------- |
| Compute        | Lambda + Function URL | ~$0 (free tier) |
| Vector DB      | Bedrock KB            | ~$0-2           |
| Embeddings     | Titan V2              | ~$0.02          |
| LLM            | Claude 3 Haiku        | ~$0.10          |
| Session Store  | DynamoDB On-Demand    | ~$0.50          |
| Document Store | S3 Standard           | ~$0.10          |
| Observability  | CloudWatch (7-day)    | ~$2-3           |
| **Total**      |                       | **~$3-5**       |

## Related Decisions

- RFC-004: Vyasa Intelligence RAG Service
- Implementation Plan: docs/IMPLEMENTATION_PLAN_VYASA_RAG.md
- OpenAPI Spec: docs/api/vyasa-rag.yaml

## CLI Scope Note

FR-CLI-001 through FR-CLI-003 (REPL mode) are **deferred** from this implementation because Lambda does not support long-running processes required for a REPL. Options for future implementation:

1. Local dev script calling Function URL
2. Docker-based CLI with local Bedrock SDK calls
3. Separate CLI package (to be addressed in follow-up PR)

## Date

2026-05-22

## Author

OrderFlow Architecture Team
