# Vyasa Intelligence RAG Service — Implementation Plan

**Based on**: PRD `docs/PRD.md`  
**Architecture**: Serverless cost-optimized (Lambda + Bedrock KB)  
**Target Cost**: ~$3-5/month for 100 visits  
**Compliance**: Fortune 500 SDLC standards

---

## 1. Executive Summary

### 1.1 Cost-Optimized Architecture Decision

| Component          | Selected Service              | Monthly Cost    | Rationale                                             |
| ------------------ | ----------------------------- | --------------- | ----------------------------------------------------- |
| **Compute**        | AWS Lambda + Function URL     | ~$0 (free tier) | 100 visits/mo fits free tier; SSE streaming supported |
| **Vector DB**      | Bedrock Knowledge Base        | ~$0-2           | No OpenSearch overhead; hybrid search included        |
| **Embeddings**     | Amazon Titan V2 (via Bedrock) | ~$0.02          | Pay-per-use, 1024-dim vectors                         |
| **LLM**            | Claude 3 Haiku (via Bedrock)  | ~$0.10          | Fast, cost-effective for RAG                          |
| **Session Store**  | DynamoDB On-Demand            | ~$0.50          | Serverless, auto-scaling                              |
| **Document Store** | S3 Standard                   | ~$0.10          | 100MB corpus storage                                  |
| **Observability**  | CloudWatch Logs (7-day)       | ~$2-3           | Structured logging, X-Ray traces                      |
| **Total**          |                               | **~$3-5/month** | 98% cheaper than ECS Fargate + OpenSearch             |

> **Throughput Note**: This architecture targets **~100 visits/month** (personal/learning use).
> The PRD specifies 100 RPM sustained throughput (NFR-PERF-003) for a production scenario.
> If 100 RPM is required, consider provisioned concurrency ($20-40/mo) and pre-warmed
> Bedrock KB connections. The current plan optimizes for cost at low traffic.

### 1.2 F500 Standards Checklist

| Standard               | Implementation                                                 |
| ---------------------- | -------------------------------------------------------------- |
| **ADR Required**       | ✅ `docs/adr/009-vyasa-serverless-architecture.md`             |
| **RFC Required**       | ✅ `docs/rfc/004-vyasa-rag-service.md`                         |
| **API Contract-First** | ✅ OpenAPI 3.1 in `docs/api/vyasa-rag.yaml`                    |
| **IaC**                | ✅ CDK stack: `infra/lib/vyasa-lambda-stack.ts`                |
| **Testing**            | ✅ Unit (Jest 80%), Integration, Contract tests                |
| **Evaluation**         | ✅ Dataset, evaluators, LLM-as-judge (FR-EVAL-001–006)         |
| **Observability**      | ✅ CloudWatch Logs + X-Ray + Structured JSON                   |
| **Security**           | ✅ IAM roles, Secrets Manager, input validation, rate limiting |
| **Reliability**        | ✅ Circuit breaker, fallback responses, 30s timeout            |
| **CI/CD**              | ✅ GitHub Actions workflow                                     |

---

## 2. Project Structure

```
apps/
├── vyasa-rag-service/           # NEW - Lambda-based RAG service
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── chat.ts              # POST /chat - non-streaming
│   │   │   ├── chat-stream.ts       # POST /chat/stream - SSE
│   │   │   ├── health.ts            # GET /health
│   │   │   └── ingest.ts            # Document ingestion (admin)
│   │   ├── services/
│   │   │   ├── agent.ts             # ReAct agent controller
│   │   │   ├── bedrock-client.ts    # Bedrock KB + LLM wrapper
│   │   │   ├── session-store.ts     # DynamoDB session management
│   │   │   ├── prompt-manager.ts    # Versioned prompt retrieval (S3)
│   │   │   ├── query-planner.ts     # Query decomposition
│   │   │   ├── context-assembler.ts # RAG context assembly
│   │   │   ├── citation-extractor.ts # Source deduplication
│   │   │   └── reflection.ts        # Self-reflection evaluator
│   │   ├── types/
│   │   │   └── index.ts             # Domain types
│   │   ├── lib/
│   │   │   ├── logger.ts            # Structured Winston logger
│   │   │   ├── tracer.ts            # X-Ray tracing helper
│   │   │   ├── circuit-breaker.ts   # Bedrock/DynamoDB circuit breaker
│   │   │   ├── rate-limiter.ts      # Token-bucket rate limiter
│   │   │   └── validators.ts        # Input validation (Zod)
│   │   └── index.ts                 # Lambda handler exports
│   ├── test/
│   │   ├── unit/
│   │   │   ├── bedrock-client.spec.ts
│   │   │   ├── session-store.spec.ts
│   │   │   ├── prompt-manager.spec.ts
│   │   │   ├── circuit-breaker.spec.ts
│   │   │   └── context-assembler.spec.ts
│   │   ├── integration/
│   │   │   └── chat-handler.spec.ts
│   │   └── fixtures/
│   │       └── test-documents.ts
│   ├── eval/
│   │   ├── dataset.jsonl            # Labeled Q/A pairs (FR-EVAL-001)
│   │   ├── runner.ts                # Experiment runner
│   │   └── evaluators/
│   │       ├── faithfulness.ts      # FR-EVAL-002
│   │       ├── relevancy.ts         # FR-EVAL-003
│   │       ├── correctness.ts       # FR-EVAL-004
│   │       └── citation-accuracy.ts # FR-EVAL-005
│   ├── cdk/
│   │   └── vyasa-lambda-stack.ts    # CDK infrastructure
│   ├── project.json                 # Nx project config
│   ├── jest.config.ts               # Test config (80% threshold)
│   ├── package.json                 # Service deps
│   ├── tsconfig.json                # TypeScript config
│   ├── Dockerfile                   # Local testing only
│   └── CLAUDE.md                    # Service context
│
libs/
├── shared-types/
│   └── src/
│       └── rag/                     # NEW - Shared RAG types
│           ├── chat.types.ts
│           ├── session.types.ts
│           └── citation.types.ts
│
infra/
├── lib/
│   └── vyasa-lambda-stack.ts        # NEW - Lambda + Bedrock KB stack
│
docs/
├── api/
│   └── vyasa-rag.yaml               # NEW - OpenAPI 3.1 spec
├── adr/
│   └── 009-vyasa-serverless-architecture.md
├── rfc/
│   └── 004-vyasa-rag-service.md
├── data/
│   └── mahabharata-chunks.jsonl     # Pre-chunked corpus (output)
└── Mahabharata (Unabridged in English).pdf  # SOURCE - Knowledge base document
```

---

## 2.1 Knowledge Source

**Source Document**: `docs/Mahabharata (Unabridged in English).pdf`

This is the single source of truth for the RAG knowledge base. The complete unabridged
English translation of the Mahabharata (~4-5 million tokens, ~200,000 verses across 18 Parvas).

**Data Pipeline** (PDF → Vector Store):

```
docs/Mahabharata (Unabridged in English).pdf
        │
        ▼ (1) PDF parsing + text extraction
docs/data/mahabharata-chunks.jsonl
        │
        ▼ (2) Embedding generation (Titan V2, 1024-dim)
S3: s3://vyasa-rag-corpus/chunks/
        │
        ▼ (3) Bedrock KB ingestion
Bedrock Knowledge Base (vector index)
```

**Chunking Strategy**:

- Split by paragraph/section boundaries
- Target chunk size: 500-1000 tokens
- Overlap: 100 tokens between chunks
- Metadata per chunk: `{ title: "Parva Name - Chapter N", page: number }`

---

## 3. Phase 1: Governance & Planning (Day 1)

### 3.1 Create RFC (2 hours)

**File**: `docs/rfc/004-vyasa-rag-service.md`

```markdown
# RFC-004: Vyasa Intelligence RAG Service

## Problem Statement

Add agentic RAG capability to OrderFlow platform for Mahabharata Q&A with strict cost constraints.

## Proposal

Serverless Lambda architecture with Bedrock Knowledge Base.

## Cost Analysis

- ECS Fargate + OpenSearch: ~$150-200/month ❌
- Lambda + Bedrock KB: ~$3-5/month ✅

## Trade-offs

| Factor                | ECS   | Lambda                                                    |
| --------------------- | ----- | --------------------------------------------------------- |
| Cold start            | N/A   | ~500ms (mitigated with provisioned concurrency if needed) |
| Scale to 0            | No    | Yes (cost win)                                            |
| Session persistence   | Redis | DynamoDB                                                  |
| Vector search latency | ~50ms | ~200-500ms                                                |

## Decision

Proceed with Lambda architecture for 100 visits/month workload.

## Timeline

- Week 1: Infrastructure + core pipeline
- Week 2: Session management + streaming
- Week 3: Testing + observability
```

### 3.2 Create ADR (1 hour)

**File**: `docs/adr/009-vyasa-serverless-architecture.md`

Key decisions to document:

- Why Lambda over ECS (cost at low traffic)
- Why Bedrock KB over OpenSearch (managed, cheaper)
- Why Function URL over API Gateway (cost savings)
- Why DynamoDB over ElastiCache (serverless, cheaper)

### 3.3 OpenAPI Spec (2 hours)

**File**: `docs/api/vyasa-rag.yaml`

Endpoints:

- `GET /health` - Health check
- `POST /chat` - Non-streaming chat
- `POST /chat/stream` - SSE streaming chat
- `POST /admin/ingest` - Document ingestion

---

## 4. Phase 2: Infrastructure (Day 2-3)

### 4.1 CDK Stack: `infra/lib/vyasa-lambda-stack.ts`

```typescript
// Key components:
// 1. Lambda function (Node.js 22, arm64, 1024MB, 30s timeout)
// 2. Function URL (CORS enabled, streaming)
// 3. Bedrock Knowledge Base
//    - S3 data source (Mahabharata chunks)
//    - Titan V2 embeddings (1024-dim)
//    - Vector store: RDS Aurora (cheaper than OpenSearch for small corpus)
// 4. DynamoDB tables
//    - sessions: TTL 7 days
//    - rate-limits: per-IP counters
//    - agent-state: stores agent reasoning steps (optional, for debugging)
// 5. S3 buckets
//    - corpus: Mahabharata chunks
//    - prompts: versioned system prompts
//    - agent-prompts: ReAct and reflection prompts
// 6. IAM roles (least privilege)
// 7. CloudWatch log group (7-day retention)
```

**Cost Optimizations**:

- Lambda: 1024MB memory (sweet spot for Bedrock latency)
- No NAT Gateway (public subnet + strict security groups)
- DynamoDB: On-demand mode (pay-per-request)
- Bedrock KB: On-demand (no provisioned throughput)
- S3: Intelligent-Tiering (auto-archive unused chunks)

### 4.2 Shared Types: `libs/shared-types/src/rag/`

```typescript
// chat.types.ts — field names aligned with PRD §7.1
export interface ChatRequest {
  session_id?: string; // Optional for new sessions (PRD)
  message: string; // Required user query (PRD: "message")
  stream?: boolean;
}

export interface ChatResponse {
  session_id: string; // PRD: "session_id"
  response: string; // PRD: "response"
  citations: Citation[]; // PRD: [{title: string}]
  token_usage?: TokenUsage; // PRD FR-LLM-004
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// session.types.ts
export interface Session {
  session_id: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
  ttl: number; // DynamoDB TTL
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// citation.types.ts — superset of PRD {title} schema
export interface Citation {
  title: string; // PRD required field
  book?: string;
  chapter?: string;
  verse?: string;
  score?: number;
}
```

---

## 5. Phase 3: Core Implementation (Day 4-7)

### 5.1 Handler: `src/handlers/chat.ts`

**Flow**:

1. Validate input (Zod)
2. Get/create session (DynamoDB)
3. **Initialize Agent** with query and session context
4. **Agent Loop** (max 3 iterations):
   a. Query Planner decomposes complex query (if needed)
   b. Retrieve context from Bedrock KB
   c. Context Assembler filters results (75% threshold)
   d. Check if context is sufficient (reflection step)
   e. If insufficient, reformulate query and continue
   f. If sufficient, generate answer
5. **Self-Reflection**: Verify answer completeness
6. Extract citations
7. Update session with full agent trace
8. Return response

**Cost optimization**: Iteration limits prevent runaway costs; reflection reduces unnecessary LLM calls

### 5.2 Handler: `src/handlers/chat-stream.ts`

**Flow**:

1. Set up Function URL response stream
2. **Stream agent reasoning steps**:
   - `event: thought` - Agent's reasoning
   - `event: action` - Tool being called (retrieve/generate)
   - `event: observation` - Retrieved context summary
   - `event: reflection` - Self-evaluation
3. **Stream final answer** via `event: message`
4. End with `event: done` containing citations and token usage

**Implementation**:

```typescript
// Lambda Function URL supports streaming responses
// Content-Type: text/event-stream
// Events:
//   thought: {thought: "Decomposing query..."}
//   action: {tool: "retrieve", input: "Karna foster father"}
//   observation: {chunks: 3, sources: [...]}
//   reflection: {complete: true}
//   message: {chunk: "Karna's foster father..."}
//   done: {citations: [...], token_usage: {...}}
```

### 5.3 Service: `src/services/bedrock-client.ts`

```typescript
// Wrapper around Bedrock KB and LLM
export class BedrockClient {
  async retrieveAndGenerate(
    query: string,
    sessionId: string
  ): Promise<RAGResult> {
    // Use Bedrock Agent Runtime: RetrieveAndGenerateCommand
    // - knowledgeBaseId: from env
    // - modelArn: anthropic.claude-3-haiku-20240307-v1:0
    // - retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 5 } }
  }

  async retrieve(query: string): Promise<RetrievalResult[]> {
    // For non-streaming: separate retrieve + generate
    // Allows citation extraction before LLM call
  }
}
```

### 5.4 Service: `src/services/agent.ts`

**File**: `src/services/agent.ts`

```typescript
// ReAct Agent Controller
export class Agent {
  private maxIterations = 3;

  async run(query: string, sessionContext: Message[]): Promise<AgentResult> {
    const trace: AgentStep[] = [];

    // Step 1: Decompose query if complex
    const subQueries = await this.planner.decompose(query);

    // Step 2: Iterative retrieval loop
    let context: string[] = [];
    for (let i = 0; i < this.maxIterations; i++) {
      // Retrieve
      const results = await this.bedrock.retrieve(subQueries[i] || query);
      context.push(...results.map(r => r.content));

      // Check sufficiency via reflection
      const sufficiency = await this.reflector.checkSufficiency(
        query,
        context.join('\n\n')
      );

      trace.push({
        iteration: i,
        query: subQueries[i] || query,
        results: results.length,
        sufficient: sufficiency.sufficient,
      });

      if (sufficiency.sufficient) break;
    }

    // Step 3: Generate answer
    const answer = await this.bedrock.generate(
      query,
      context.join('\n\n'),
      sessionContext
    );

    // Step 4: Final reflection
    const quality = await this.reflector.evaluateAnswer(query, answer);

    return { answer, trace, quality };
  }
}
```

### 5.5 Service: `src/services/query-planner.ts`

**File**: `src/services/query-planner.ts`

```typescript
// Query Decomposition for multi-hop questions
export class QueryPlanner {
  async decompose(query: string): Promise<string[]> {
    // Use LLM to analyze if query needs decomposition
    // Examples:
    //   "Who was Karna's foster father?" → ["Karna foster father"]
    //   "What happened to Arjuna's son after the war?" →
    //     ["Arjuna son name", "Abhimanyu fate after war"]

    const analysis = await this.llm.analyze(query);
    if (analysis.needsDecomposition) {
      return analysis.subQueries;
    }
    return [query];
  }
}
```

### 5.6 Service: `src/services/reflection.ts`

**File**: `src/services/reflection.ts`

```typescript
// Self-Reflection Evaluator
export class Reflector {
  async checkSufficiency(
    query: string,
    context: string
  ): Promise<SufficiencyCheck> {
    // Ask LLM: "Is the context sufficient to answer the query?"
    // Returns: { sufficient: boolean, missingInfo?: string }
  }

  async evaluateAnswer(
    query: string,
    answer: string
  ): Promise<QualityEvaluation> {
    // Ask LLM: "Does the answer fully address the query?"
    // Returns: { complete: boolean, issues?: string[] }
  }
}
```

### 5.7 Service: `src/services/session-store.ts`

```typescript
// DynamoDB session management with TTL
export class SessionStore {
  async getSession(sessionId: string): Promise<Session> {
    // DynamoDB GetItem
  }

  async updateSession(sessionId: string, message: Message): Promise<void> {
    // DynamoDB UpdateItem with TTL (7 days)
  }
}
```

### 5.5 Context Assembly

Per PRD FR-CORE-004:

```typescript
// Concatenate filtered chunks with "\n\n" separator
function assembleContext(results: RetrievalResult[]): string {
  return results
    .filter(r => r.score >= maxScore * 0.75) // 75% threshold
    .map(r => `[${r.metadata.source}] ${r.content}`)
    .join('\n\n');
}
```

### 5.6 Prompt Manager (FR-LLM-001 — P0)

Per PRD §8.3: prompts must be stored externally, versioned, and hot-swappable.

**File**: `src/services/prompt-manager.ts`

```typescript
// Versioned system prompts stored in S3
export class PromptManager {
  private cache: Map<string, { content: string; version: string }> = new Map();

  async getPrompt(name: string, version?: string): Promise<PromptTemplate> {
    // 1. Check in-memory cache (TTL: 5 min)
    // 2. Fetch from S3: s3://{bucket}/prompts/{name}/{version}.md
    //    - If no version specified, fetch "latest"
    // 3. Parse template with {{context}} and {{user_message}} placeholders
    // 4. Return { content, version, metadata }
  }

  invalidateCache(name: string): void {
    this.cache.delete(name);
  }
}

export interface PromptTemplate {
  name: string;
  version: string;
  content: string;
  metadata: {
    author: string;
    updated_at: string;
    description: string;
  };
}
```

**S3 Prompt Structure**:

```
s3://vyasa-rag-prompts/
├── prompts/
│   ├── vyasa-system/
│   │   ├── v1.0.0.md    # Initial persona prompt
│   │   ├── v1.1.0.md    # Refined citations
│   │   └── latest.md    # Symlink to current
│   └── evaluator/
│       └── v1.0.0.md    # LLM-as-judge prompt
```

**CDK Addition**: S3 bucket for prompts with versioning enabled, IAM read access for Lambda.

### 5.7 Circuit Breaker (NFR-REL-004)

**File**: `src/lib/circuit-breaker.ts`

```typescript
// Lightweight circuit breaker for Bedrock and DynamoDB
export class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeoutMs: number = 30000,
    private readonly fallbackFn?: () => Promise<any>
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // closed: normal operation
    // open: reject immediately, return fallback
    // half-open: allow one request to test recovery
  }
}
```

**Fallback Responses** (per PRD NFR-REL-004):

- Bedrock KB down → `"I'm temporarily unable to search. Please try again shortly."`
- LLM down → Return retrieved context without generation
- DynamoDB down → Operate in stateless mode (no session persistence)

### 5.8 Rate Limiter (NFR-SEC-003)

**File**: `src/lib/rate-limiter.ts`

```typescript
// DynamoDB-backed token-bucket rate limiter
export class RateLimiter {
  async checkLimit(
    key: string, // IP or API key
    limits: { perMinute: number; perHour: number }
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    // 1. Read counter from DynamoDB (atomic increment)
    // 2. Check against per-user limit (10 RPM default)
    // 3. Check against global limit (100 RPM)
    // 4. Return 429 with Retry-After header if exceeded
  }
}
```

**Default Limits**:

- Per-IP: 10 requests/minute, 100 requests/hour
- Global: 100 requests/minute (matches PRD NFR-PERF-003)

---

## 6. Phase 4: Testing (Day 8-9)

### 6.1 Unit Tests (80% coverage)

```typescript
// bedrock-client.spec.ts
describe('BedrockClient', () => {
  it('should retrieve and generate response', async () => {});
  it('should filter results by 75% threshold', async () => {});
  it('should deduplicate citations', async () => {});
  it('should respect circuit breaker state', async () => {});
});

// session-store.spec.ts
describe('SessionStore', () => {
  it('should create new session with UUID', async () => {});
  it('should retrieve existing session', async () => {});
  it('should enforce TTL', async () => {});
  it('should isolate sessions (FR-SES-003)', async () => {});
});

// prompt-manager.spec.ts
describe('PromptManager', () => {
  it('should fetch prompt by name and version', async () => {});
  it('should return latest when no version specified', async () => {});
  it('should cache prompts with 5-min TTL', async () => {});
  it('should invalidate cache on demand', async () => {});
});

// circuit-breaker.spec.ts
describe('CircuitBreaker', () => {
  it('should allow requests when closed', async () => {});
  it('should open after threshold failures', async () => {});
  it('should return fallback when open', async () => {});
  it('should transition to half-open after timeout', async () => {});
});

// rate-limiter.spec.ts
describe('RateLimiter', () => {
  it('should allow requests under limit', async () => {});
  it('should reject with 429 when exceeded', async () => {});
  it('should track per-IP and global limits', async () => {});
});
```

### 6.2 Integration Tests

```typescript
// chat-handler.spec.ts
describe('POST /chat', () => {
  it('should return 200 with response and citations', async () => {});
  it('should create session if session_id not provided', async () => {});
  it('should maintain conversation context', async () => {});
  it('should return 422 for invalid input', async () => {});
  it('should return 503 when Bedrock is unavailable (FR-API-004)', async () => {});
  it('should return 429 when rate limited (NFR-SEC-003)', async () => {});
});

describe('POST /chat/stream', () => {
  it('should return SSE stream with session_id prefix', async () => {});
  it('should end stream with [DONE] marker', async () => {});
});
```

### 6.3 Contract Tests (Pact)

```typescript
// Verify OpenAPI spec compliance
// Validate ChatRequest/ChatResponse schemas match docs/api/vyasa-rag.yaml
// Validate SSE event format matches PRD §7.2
```

---

## 7. Phase 5: Evaluation System (Day 10-11)

Per PRD §9 and FR-EVAL-001 through FR-EVAL-006.

### 7.1 Evaluation Dataset (FR-EVAL-001)

**File**: `apps/vyasa-rag-service/eval/dataset.jsonl`

```json
{
  "id": "q001",
  "question": "Who was Karna and what was his relationship with the Pandavas?",
  "reference_answer": "Karna was the eldest son of Kunti, born before her marriage to Pandu...",
  "expected_citations": [
    "Mahabharata - Adi Parva",
    "Mahabharata - Udyoga Parva"
  ],
  "tags": ["character", "karna", "pandavas"]
}
```

**Target**: 30-50 labeled Q/A pairs covering:

- Character questions (Arjuna, Krishna, Bhishma, etc.)
- Event questions (Kurukshetra, dice game, etc.)
- Philosophical questions (Bhagavad Gita themes)
- Cross-book questions (span multiple Parvas)

### 7.2 Evaluation Runner

**File**: `apps/vyasa-rag-service/eval/runner.ts`

```typescript
export class EvalRunner {
  async runExperiment(
    dataset: EvalItem[],
    config: { modelId: string; promptVersion: string }
  ): Promise<ExperimentResult> {
    // 1. For each question:
    //    a. Call RAG pipeline (retrieve + generate)
    //    b. Collect: answer, citations, retrieved_context, token_usage
    // 2. Score each response with evaluators
    // 3. Aggregate metrics
    // 4. Write results to S3 (eval-results/{timestamp}.json)
  }
}
```

### 7.3 Evaluators (FR-EVAL-002 through FR-EVAL-006)

```typescript
// eval/evaluators/faithfulness.ts (FR-EVAL-002)
export async function scoreFaithfulness(
  answer: string,
  context: string,
  judgeModel: string // Separate stronger model (FR-EVAL-006)
): Promise<number> {
  // LLM-as-judge: "Are all claims in the answer supported by the context?"
  // Returns 0.0 - 1.0 score
  // Target: > 0.85
}

// eval/evaluators/relevancy.ts (FR-EVAL-003)
export async function scoreRelevancy(
  question: string,
  answer: string,
  judgeModel: string
): Promise<number> {
  // "Does the answer address the question asked?"
  // Target: > 0.80
}

// eval/evaluators/correctness.ts (FR-EVAL-004)
export async function scoreCorrectness(
  answer: string,
  referenceAnswer: string,
  judgeModel: string
): Promise<number> {
  // Factual accuracy against reference
  // Target: > 0.80
}

// eval/evaluators/citation-accuracy.ts (FR-EVAL-005)
export async function scoreCitationAccuracy(
  citations: Citation[],
  expectedCitations: string[],
  context: string
): Promise<number> {
  // Do citations correctly support the claims?
  // Target: > 0.90
}
```

### 7.4 Judge Model Configuration (FR-EVAL-006)

Use a **separate, stronger model** as evaluator to avoid self-evaluation bias:

- RAG generation: Claude 3 Haiku (fast, cheap)
- Evaluation judge: Claude 3.5 Sonnet (higher quality scoring)
- Configured via `JUDGE_MODEL` env variable (PRD §12.2)

### 7.5 Evaluation Results Schema

```json
{
  "experiment_id": "exp-20260522-001",
  "timestamp": "2026-05-22T12:00:00Z",
  "config": {
    "model": "claude-3-haiku",
    "prompt_version": "v1.0.0",
    "embedding_model": "titan-v2-1024"
  },
  "metrics": {
    "faithfulness": { "mean": 0.87, "min": 0.72, "p50": 0.89 },
    "relevancy": { "mean": 0.83, "min": 0.65, "p50": 0.85 },
    "correctness": { "mean": 0.81, "min": 0.6, "p50": 0.82 },
    "citation_accuracy": { "mean": 0.91, "min": 0.8, "p50": 0.93 }
  },
  "total_questions": 40,
  "total_tokens": 125000,
  "duration_seconds": 180
}
```

---

## 8. Phase 6: Observability (Day 12)

### 8.1 Structured Logging

```typescript
// lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  format: winston.format.json(),
  defaultMeta: { service: 'vyasa-rag' },
  transports: [new winston.transports.Console()],
});

// Usage in handlers:
logger.info('Processing chat request', {
  correlationId: context.awsRequestId,
  sessionId,
  queryLength: query.length,
});
```

### 8.2 X-Ray Tracing

```typescript
// lib/tracer.ts
import AWSXRay from 'aws-xray-sdk-core';

export const tracer = AWSXRay.getSegment();

// Subsegments for:
// - Bedrock KB retrieval
// - LLM generation
// - DynamoDB operations
```

### 8.3 Metrics

Custom CloudWatch metrics:

- `VyasaRAG/RequestLatency` (p95, p99)
- `VyasaRAG/BedrockTokenUsage` (input/output)
- `VyasaRAG/RetrievalScore` (average)
- `VyasaRAG/SessionCount` (active)

---

## 9. Phase 7: CI/CD (Day 13)

### 9.1 GitHub Actions Workflow

**File**: `.github/workflows/vyasa-rag-deploy.yml`

```yaml
name: Vyasa RAG Deploy

on:
  push:
    branches: [main]
    paths: ['apps/vyasa-rag-service/**', 'infra/lib/vyasa-lambda-stack.ts']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npx nx test vyasa-rag-service
      - run: npx nx lint vyasa-rag-service

  deploy:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
      - run: npm ci
      - run: npx nx build vyasa-rag-service
      - run: cd infra && npx cdk deploy VyasaLambdaStack --require-approval never
```

---

## 10. Cost Monitoring & Alerts

### 10.1 AWS Budgets

Set up in CDK:

```typescript
// Monthly budget: $10 (2x expected cost)
new budgets.CfnBudget(this, 'VyasaBudget', {
  budget: {
    budgetName: 'vyasa-rag-monthly',
    budgetLimit: { amount: 10, unit: 'USD' },
    timeUnit: 'MONTHLY',
  },
  notificationsWithSubscribers: [
    {
      notification: {
        notificationType: 'ACTUAL',
        comparisonOperator: 'GREATER_THAN',
        threshold: 80,
      },
      subscribers: [
        { subscriptionType: 'EMAIL', address: 'alerts@example.com' },
      ],
    },
  ],
});
```

### 10.2 Cost Allocation Tags

Tag all resources:

- `Project`: vyasa-rag
- `Environment`: dev/staging/prod
- `Owner`: ai-team
- `CostCenter`: learning

---

## 11. CLI Scope Decision

> **Decision**: FR-CLI-001 through FR-CLI-003 are **deferred** from this implementation.

**Rationale**: The Lambda-based serverless architecture does not have a persistent
process to host a REPL. CLI mode requires a long-running process (e.g., `node app.js`).

**Options for future implementation**:

1. **Local dev script**: `apps/vyasa-rag-service/scripts/cli.ts` — a standalone Node.js
   script that calls the deployed Lambda Function URL, with readline-based REPL
2. **Docker-based CLI**: Run the service locally in Docker with a CLI entrypoint
3. **Separate CLI package**: `apps/vyasa-cli/` with direct Bedrock SDK calls

**Recommended**: Option 1 (minimal effort, reuses deployed infra). To be addressed
in a follow-up PR after core service is deployed. Document in ADR-009.

---

## 12. Timeline Summary

| Phase                      | Duration  | Deliverables                                                                    |
| -------------------------- | --------- | ------------------------------------------------------------------------------- |
| **1. Governance**          | Day 1     | RFC, ADR, OpenAPI spec                                                          |
| **2. Infrastructure**      | Day 2-3   | CDK stack, shared types, S3 corpus, prompt bucket                               |
| **3. Core Implementation** | Day 4-7   | Handlers, services, RAG pipeline, prompt manager, circuit breaker, rate limiter |
| **4. Testing**             | Day 8-9   | Unit (80%), integration, contract tests                                         |
| **5. Evaluation System**   | Day 10-11 | Dataset, evaluators, runner, judge model config                                 |
| **6. Observability**       | Day 12    | Logging, tracing, metrics, dashboards                                           |
| **7. CI/CD**               | Day 13    | GitHub Actions workflow                                                         |
| **8. Documentation**       | Day 14    | CLAUDE.md, runbooks, CHANGELOG                                                  |
| **9. Deploy & Validate**   | Day 15    | Staging → Production                                                            |

**Total**: ~3 weeks for production-ready service

---

## 13. Risk Mitigation

| Risk                          | Mitigation                                                                 |
| ----------------------------- | -------------------------------------------------------------------------- |
| Bedrock KB cold start (5-10s) | Acceptable for 100 visits; add provisioned concurrency if needed (+$20/mo) |
| Lambda cold start (500ms)     | Use 1024MB memory; keep-alive pings optional                               |
| Cost overruns                 | Budget alerts at 80%; teardown automation after 30 days                    |
| Session loss                  | DynamoDB point-in-time recovery (PITR) enabled                             |
| LLM throttling                | Circuit breaker + exponential backoff; fallback responses (NFR-REL-004)    |
| Embedding dim mismatch        | Titan V2 uses 1024-dim (not 3072); vector index configured accordingly     |
| Prompt drift                  | Versioned prompts in S3; eval system tracks quality per prompt version     |
| Rate abuse                    | DynamoDB-backed rate limiter (10 RPM/IP, 100 RPM global)                   |
| Eval score regression         | Automated eval runner in CI; block deploy if faithfulness < 0.85           |

---

## 14. Post-Deployment

### 14.1 Validation Checklist

**Functional (PRD §13.1)**:

- [ ] Health endpoint responds < 500ms
- [ ] Chat endpoint returns `response` + `citations` (PRD schema)
- [ ] Streaming works (SSE format with `session_id` prefix)
- [ ] Sessions persist across requests (multi-turn)
- [ ] Session isolation — no cross-session data leakage
- [ ] Prompt loaded from S3 versioned bucket
- [ ] 422 returned for invalid input
- [ ] 503 returned when Bedrock unavailable
- [ ] 429 returned when rate limited

**Performance (PRD §13.2)**:

- [ ] p95 latency < 3 seconds (under expected load)
- [ ] p99 latency < 5 seconds
- [ ] Rate limiter enforces 100 RPM global cap

**Quality (PRD §13.3)**:

- [ ] Faithfulness score > 0.85 on evaluation dataset
- [ ] Citation accuracy > 0.90
- [ ] Answer relevancy > 0.80
- [ ] Answer correctness > 0.80

**Operational (PRD §13.4)**:

- [ ] CloudWatch logs in structured JSON format
- [ ] X-Ray traces capture full pipeline (embed → search → filter → generate)
- [ ] Secrets in AWS Secrets Manager (not in code)
- [ ] 80% test coverage passing
- [ ] Cost < $5 in first month
- [ ] Circuit breaker tested with simulated Bedrock failure

### 14.2 Teardown Procedure

```bash
# Destroy all resources when done
cd infra && npx cdk destroy VyasaLambdaStack --force
```

---

**Next Action**: Approve this plan → Create RFC → Begin Day 1 tasks

---

## 15. PRD Coverage Matrix

| PRD Requirement                   | Status      | Implementation Section       |
| --------------------------------- | ----------- | ---------------------------- |
| FR-CORE-001 (Embedding)           | ✅          | §4.1 CDK (Titan V2 1024-dim) |
| FR-CORE-002 (Hybrid search)       | ✅          | §5.3 Bedrock KB              |
| FR-CORE-003 (75% filter)          | ✅          | §5.5 Context Assembly        |
| FR-CORE-004 (Context assembly)    | ✅          | §5.5 Context Assembly        |
| FR-CORE-005 (Citation dedup)      | ✅          | §2 citation-extractor.ts     |
| FR-LLM-001 (Prompt versioning)    | ✅          | §5.6 Prompt Manager          |
| FR-LLM-002 (Grounded responses)   | ✅          | §5.3 Bedrock KB RAG          |
| FR-LLM-003 (SSE streaming)        | ✅          | §5.2 chat-stream handler     |
| FR-LLM-004 (Token tracking)       | ✅          | §4.2 ChatResponse type       |
| FR-SES-001 (Session creation)     | ✅          | §5.4 Session Store           |
| FR-SES-002 (Multi-turn)           | ✅          | §5.4 Session Store           |
| FR-SES-003 (Session isolation)    | ✅          | §6.1 Tests                   |
| FR-API-001 (Health check)         | ✅          | §5.1 health.ts               |
| FR-API-002 (POST /chat)           | ✅          | §5.1 chat.ts                 |
| FR-API-003 (POST /chat/stream)    | ✅          | §5.2 chat-stream.ts          |
| FR-API-004 (422/503 errors)       | ✅          | §6.2 Integration Tests       |
| FR-CLI-001–003 (REPL)             | ⏳ Deferred | §11 CLI Scope Decision       |
| FR-EVAL-001–006 (Evaluation)      | ✅          | §7 Evaluation System         |
| NFR-PERF-001 (p95 < 3s)           | ✅          | §14.1 Checklist              |
| NFR-PERF-002 (p99 < 5s)           | ✅          | §14.1 Checklist              |
| NFR-PERF-003 (100 RPM)            | ⚠️ Note     | §1.1 Throughput Note         |
| NFR-REL-004 (Circuit breaker)     | ✅          | §5.7 Circuit Breaker         |
| NFR-REL-005 (30s timeout)         | ✅          | §5.7 (resetTimeoutMs)        |
| NFR-OBS-001 (Structured logs)     | ✅          | §8.1 Winston Logger          |
| NFR-OBS-002 (Distributed tracing) | ✅          | §8.2 X-Ray                   |
| NFR-OBS-003 (Metrics)             | ✅          | §8.3 CloudWatch              |
| NFR-SEC-001 (Secrets)             | ✅          | §4.1 CDK (Secrets Manager)   |
| NFR-SEC-002 (Input validation)    | ✅          | §2 validators.ts (Zod)       |
| NFR-SEC-003 (Rate limiting)       | ✅          | §5.8 Rate Limiter            |
| NFR-SCL-003 (External sessions)   | ✅          | §5.4 DynamoDB                |
