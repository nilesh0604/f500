# Vyasa Intelligence RAG Service

## Overview

Agentic RAG (Retrieval-Augmented Generation) service for answering questions about the Mahabharata. Built with AWS Lambda, Bedrock Knowledge Base, and DynamoDB.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Lambda Handler                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  /chat        │  │ /chat/stream │  │    /health       │ │
│  │  (non-stream) │  │  (SSE)       │  │                  │ │
│  └───────┬───────┘  └───────┬──────┘  └──────────────────┘ │
└──────────┼──────────────────┼──────────────────────────────┘
           │                  │
           ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      ReAct Agent Loop                        │
│                                                              │
│  1. Thought: Analyze query                                   │
│  2. Action: Query Planner → Sub-queries                      │
│  3. Action: Retrieve → Bedrock KB                           │
│  4. Observation: Retrieved results                            │
│  5. Reflection: Check sufficiency                          │
│  6. (loop if needed, max 3 iterations)                      │
│  7. Action: Generate answer                                 │
│  8. Reflection: Evaluate answer quality                       │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                     External Services                        │
│  • Bedrock Knowledge Base (vector search)                    │
│  • Amazon Nova Pro (LLM generation)                           │
│  • DynamoDB (sessions, rate limits)                          │
│  • S3 (corpus, prompts)                                     │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

| File                             | Purpose                             |
| -------------------------------- | ----------------------------------- |
| `src/index.ts`                   | Lambda entry point, request routing |
| `src/handlers/chat.ts`           | Non-streaming chat handler          |
| `src/handlers/chat-stream.ts`    | SSE streaming chat handler          |
| `src/services/agent.ts`          | ReAct agent controller              |
| `src/services/query-planner.ts`  | Query decomposition                 |
| `src/services/reflection.ts`     | Self-evaluation                     |
| `src/services/bedrock-client.ts` | Bedrock KB + LLM wrapper            |
| `src/services/session-store.ts`  | DynamoDB session management         |
| `src/services/prompt-manager.ts` | S3 prompt retrieval                 |
| `src/lib/circuit-breaker.ts`     | Fault tolerance                     |
| `src/lib/rate-limiter.ts`        | DynamoDB rate limiting              |

## Environment Variables

| Variable               | Description                           |
| ---------------------- | ------------------------------------- |
| `BEDROCK_KB_ID`        | Bedrock Knowledge Base ID             |
| `BEDROCK_MODEL_ARN`    | Claude model ARN                      |
| `SESSIONS_TABLE`       | DynamoDB sessions table               |
| `RATE_LIMITS_TABLE`    | DynamoDB rate limits table            |
| `PROMPTS_BUCKET`       | S3 prompts bucket                     |
| `MAX_AGENT_ITERATIONS` | Max retrieval iterations (default: 3) |
| `SESSION_TTL_DAYS`     | Session expiration (default: 7)       |

## API Endpoints

### POST /chat

Non-streaming chat with full agent trace.

```json
{
  "session_id": "optional-uuid",
  "message": "Who was Karna?"
}
```

### POST /chat/stream

SSE streaming with agent reasoning steps.

Events: `thought`, `action`, `observation`, `reflection`, `message`, `done`

### GET /health

Health check with dependency status.

## Development

```bash
# Build
npx nx build vyasa-rag-service

# Test
npx nx test vyasa-rag-service

# Deploy (via CDK)
cd infra && npx cdk deploy OrderFlow-VyasaRag
```

## Cost Optimization

- Lambda 1024MB (sweet spot for Bedrock latency)
- DynamoDB on-demand billing
- S3 Intelligent-Tiering
- Max 3 agent iterations (prevents runaway costs)

Target: ~$3-5/month for 100 visits
