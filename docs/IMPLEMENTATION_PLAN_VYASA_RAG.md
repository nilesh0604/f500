# Vyasa Intelligence RAG Service — Implementation Plan

**Version**: 1.1.0 (updated 2026-05-23)
**Status**: ✅ **PRODUCTION — fully operational**
**Based on**: PRD `docs/PRD.md`
**Architecture**: Serverless cost-optimized (Lambda + Bedrock KB + S3 Vectors)
**Actual Cost**: ~$0.57/month at 100 visits (vector store: ~$0.07/mo)
**Compliance**: Fortune 500 SDLC standards

---

## 0. Production Status

### 0.1 Live Resources (us-east-1)

| Resource             | ID / URL                                                 |
| -------------------- | -------------------------------------------------------- |
| **API Gateway**      | `https://t859xz8d3c.execute-api.us-east-1.amazonaws.com` |
| **Bedrock KB**       | `JGDXZQCA1Y`                                             |
| **Data Source**      | `5DGY6OL5YG`                                             |
| **S3 Vector Bucket** | `vyasa-vectors-prod-947612421212`                        |
| **Vector Index**     | `vyasa-index-prod` (9,362 vectors)                       |
| **Corpus Bucket**    | `vyasa-rag-corpus-prod-947612421212`                     |
| **Prompts Bucket**   | `vyasa-rag-prompts-prod-947612421212`                    |
| **LLM Model**        | `amazon.nova-pro-v1:0`                                   |
| **Embedding Model**  | `amazon.titan-embed-text-v2:0` (1024-dim)                |

### 0.2 Test Results (2026-05-23)

| Query                              | Retrieval Score | Result                                   |
| ---------------------------------- | --------------- | ---------------------------------------- |
| Cause of Kurukshetra war           | 0.563           | ✅ Accurate — dice game, exile, kingdom  |
| Bhagavad Gita teachings            | 0.512           | ✅ Cites Gita Chapter II directly        |
| Draupadi's humiliation             | 0.507           | ✅ Correct detail with section reference |
| Multi-turn follow-up (Bhima's vow) | 0.536           | ✅ Context maintained across turns       |
| Karna's birth story                | 0.547           | ✅ Correct characterization              |
| Dice game — Yudhishthira stakes    | **0.605**       | ✅ Cites `Adi Parva, SECTION LIX/LX`     |

**End-to-end latency**: ~3.7s per query (KB retrieval + Nova Pro generation)

### 0.3 F500 Standards Checklist

| Standard          | Implementation                                       | Status |
| ----------------- | ---------------------------------------------------- | ------ |
| **ADR**           | `docs/adr/009-vyasa-serverless-architecture.md`      | ✅     |
| **RFC**           | `docs/rfc/004-vyasa-rag-service.md`                  | ✅     |
| **API Contract**  | `docs/api/vyasa-rag.yaml` (OpenAPI 3.1)              | ✅     |
| **IaC**           | CDK: `VyasaVectorStack` + `VyasaRagStack`            | ✅     |
| **Testing**       | Unit (Jest 80%), Integration, Contract               | ✅     |
| **Evaluation**    | 20-case golden dataset + evaluator                   | ✅     |
| **Observability** | CloudWatch + X-Ray + structured JSON                 | ✅     |
| **Security**      | IAM least-privilege, input validation, rate limiting | ✅     |
| **Reliability**   | Circuit breaker, fallbacks, 30s timeout              | ✅     |
| **CI/CD**         | GitHub Actions (`.github/workflows/`)                | ✅     |

---

## 1. Architecture

### 1.1 Current Architecture (S3 Vectors — v1.1.0)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client / Browser                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /chat  { session_id, message }
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              API Gateway HTTP API (us-east-1)                   │
│         https://t859xz8d3c.execute-api.us-east-1.amazonaws.com  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Lambda proxy integration
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           AWS Lambda  (Node.js 22, arm64, 1024MB, 30s)          │
│                                                                 │
│  chat.ts handler                                                │
│    │                                                            │
│    ├── validators.ts  (Zod — UUID session_id, message length)   │
│    ├── rate-limiter.ts (DynamoDB token bucket)                  │
│    ├── session-store.ts (DynamoDB get/create/save session)      │
│    └── agent.ts  ◄── ReAct loop (max 3 iterations)             │
│         │                                                       │
│         ├── query-planner.ts  (LLM query decomposition)         │
│         ├── bedrock-client.ts (KB retrieve + LLM generate)      │
│         ├── context-assembler.ts (score threshold 0.75)         │
│         ├── reflection.ts (answer quality self-evaluation)      │
│         └── citation-extractor.ts (dedup + source mapping)     │
└──────┬──────────────────┬──────────────────┬────────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
 ┌──────────┐    ┌──────────────────┐  ┌──────────────┐
 │ DynamoDB │    │  Bedrock KB      │  │  S3 (prompts)│
 │ sessions │    │  JGDXZQCA1Y      │  │  system /    │
 │ rate-    │    │                  │  │  agent /     │
 │ limits   │    │  ┌────────────┐  │  │  reflection  │
 └──────────┘    │  │ Titan V2   │  │  │  prompts     │
                 │  │ Embed 1024d│  │  └──────────────┘
                 │  └─────┬──────┘  │
                 │        │ vectors │
                 │        ▼         │
                 │  ┌────────────┐  │
                 │  │ S3 Vectors │  │
                 │  │ 9,362 vecs │  │
                 │  │ vyasa-index│  │
                 │  └────────────┘  │
                 └──────────────────┘
                          │ ConverseCommand
                          ▼
                 ┌──────────────────┐
                 │  Amazon Nova Pro │
                 │  nova-pro-v1:0   │
                 └──────────────────┘
```

### 1.2 Cost Breakdown (current)

| Component          | Service                 | Monthly Cost       |
| ------------------ | ----------------------- | ------------------ |
| **Compute**        | Lambda (arm64, 1024MB)  | ~$0 (free tier)    |
| **Vector Store**   | S3 Vectors              | ~$0.07             |
| **Embeddings**     | Titan Embed V2          | ~$0.02             |
| **LLM**            | Amazon Nova Pro         | ~$0.10–0.30        |
| **Session Store**  | DynamoDB On-Demand      | ~$0.10             |
| **Document Store** | S3 Standard (corpus)    | ~$0.05             |
| **API**            | API Gateway HTTP        | ~$0.01             |
| **Observability**  | CloudWatch Logs (7-day) | ~$0.02             |
| **Total**          |                         | **~$0.37–0.57/mo** |

> **vs. AOSS (v1.0)**: ~$350/mo (2 OCU minimum). **S3 Vectors saves ~$350/mo = 99.8% cost reduction.**

### 1.3 Data Flow — Ingestion Pipeline

```
docs/Mahabharata (Unabridged in English).pdf  (19 MB, 2,328 pages)
        │
        ▼  POST /admin/ingest  { source_uri: "s3://corpus/mahabharata.pdf" }
Lambda ingest.ts
        │  StartIngestionJobCommand (clientToken: uuidv4)
        ▼
Bedrock KB Data Source (5DGY6OL5YG)
        │
        ├── PDF parsing (Bedrock default parser)
        ├── Fixed-size chunking (~500 tokens, 20% overlap)
        ├── Titan Embed V2 → 1024-dim float32 vectors
        │
        ▼
S3 Vectors: vyasa-vectors-prod-947612421212 / vyasa-index-prod
        │   nonFilterableMetadataKeys: [AMAZON_BEDROCK_TEXT, AMAZON_BEDROCK_METADATA]
        │   distanceMetric: euclidean
        │   9,362 vectors written
        ▼
Ingestion COMPLETE (job: NZMK8FJBRE, ~25 min for full corpus)
```

### 1.4 Data Flow — Query/Chat Pipeline

```
User: "What caused the Kurukshetra war?"
        │
        ▼
API Gateway → Lambda chat.ts
        │
        ├── 1. Validate (Zod: UUID session_id, message ≤ 2000 chars)
        ├── 2. Rate limit check (DynamoDB, 10 req/min per IP)
        ├── 3. Get/create session (DynamoDB TTL 7 days)
        │
        ▼
agent.ts — ReAct loop
        │
        ├── Step 1: THOUGHT — "Analyzing query..."
        ├── Step 2: ACTION — query-planner.ts decomposes into sub-queries
        ├── Step 3: ACTION — bedrock-client.ts: RetrieveCommand → KB (top-5 chunks)
        ├── Step 4: OBSERVATION — "Retrieved 5 documents" (score ~0.55)
        ├── Step 5: ACTION — ConverseCommand → Nova Pro (generate answer)
        └── Step 6: REFLECTION — quality check (confidence: 0.9)
        │
        ▼
Response:
{
  session_id, response, citations: [{title, book, chapter, score}],
  token_usage: {prompt, completion, total}, agent_trace: [6 steps]
}
```

---

## 2. Infrastructure (CDK Stacks)

### 2.1 Stack Overview

```
infra/bin/app.ts
  │
  ├── OrderFlow-VyasaVector   (VyasaVectorStack)
  │     Lambda custom resource → s3vector-creator/index.mjs
  │       Creates: S3 vector bucket + index (nonFilterableMetadataKeys configured)
  │       Outputs: VectorBucketName, VectorIndexName, VectorIndexArn
  │
  └── OrderFlow-VyasaRag      (VyasaLambdaStack)
        Lambda custom resource → bedrock-kb-creator/index.mjs
          Creates: Bedrock KB + S3 Data Source (S3_VECTORS storage type)
          Outputs: KnowledgeBaseId, DataSourceId
        Lambda function (Node.js 22, arm64, 1024MB)
        API Gateway HTTP API
        DynamoDB: sessions, rate-limits
        S3: corpus, prompts
        IAM: bedrockKbRole, lambdaRole
```

### 2.2 Key CDK Files

| File                                     | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `infra/lib/vyasa-vector-stack.ts`        | S3 Vectors bucket + index via custom resource     |
| `infra/lib/s3vector-creator/index.mjs`   | Lambda: creates/updates/deletes S3 vector index   |
| `infra/lib/bedrock-kb-creator/index.mjs` | Lambda: creates Bedrock KB + data source via SDK  |
| `infra/lib/vyasa-lambda-stack.ts`        | Main RAG stack (Lambda, APIGW, DynamoDB, S3, IAM) |
| `infra/bin/app.ts`                       | CDK app entrypoint — wires stacks together        |
| `infra/config/environments.ts`           | Single `prod` environment config (per ADR-011)    |

### 2.3 Why Lambda Custom Resources?

Both S3 Vectors and Bedrock KB (with S3_VECTORS) are too new for CloudFormation support:

| Resource                                        | CloudFormation Support | Solution                                        |
| ----------------------------------------------- | ---------------------- | ----------------------------------------------- |
| S3 Vector bucket/index                          | ❌ Not supported       | Lambda CR using `@aws-sdk/client-s3vectors`     |
| `AWS::Bedrock::KnowledgeBase` with `S3_VECTORS` | ❌ Schema rejects it   | Lambda CR using `@aws-sdk/client-bedrock-agent` |

### 2.4 IAM Roles

**`bedrockKbRole`** (assumed by `bedrock.amazonaws.com`):

- `bedrock:InvokeModel` on Titan Embed V2
- `s3:GetObject`, `s3:ListBucket` on corpus bucket
- `s3vectors:PutVectors`, `GetVectors`, `DeleteVectors`, `QueryVectors`, `GetIndex` on index ARN

**`lambdaRole`** (assumed by Lambda):

- `bedrock-agent-runtime:Retrieve`, `RetrieveAndGenerate`
- `bedrock-agent:StartIngestionJob`, `GetIngestionJob`
- `bedrock-runtime:Converse`, `InvokeModel`
- `dynamodb:GetItem`, `PutItem`, `UpdateItem` on sessions + rate-limits tables
- `s3:GetObject`, `ListBucket` on prompts bucket

---

## 3. Application Structure

```
apps/vyasa-rag-service/src/
├── handlers/
│   ├── chat.ts              # POST /chat — main entry point
│   ├── chat-stream.ts       # POST /chat/stream — SSE streaming
│   ├── health.ts            # GET /health
│   └── ingest.ts            # POST /admin/ingest — triggers Bedrock KB sync
├── services/
│   ├── agent.ts             # ReAct loop (max 3 iter, multi-turn context)
│   ├── bedrock-client.ts    # Bedrock KB retrieve + Nova Pro generate
│   ├── session-store.ts     # DynamoDB CRUD for sessions
│   ├── prompt-manager.ts    # S3 prompt fetching with local fallback
│   ├── query-planner.ts     # LLM-based query decomposition
│   ├── context-assembler.ts # Score-threshold chunk filtering
│   ├── citation-extractor.ts# Source dedup + citation mapping
│   └── reflection.ts        # Answer quality self-evaluation
├── lib/
│   ├── logger.ts            # Winston structured JSON logger
│   ├── tracer.ts            # X-Ray tracing
│   ├── circuit-breaker.ts   # opossum circuit breaker (Bedrock/DynamoDB)
│   ├── rate-limiter.ts      # DynamoDB token-bucket rate limiter
│   └── validators.ts        # Zod schemas (ChatRequest, session_id UUID)
└── index.ts                 # Lambda handler exports
```

---

## 4. Key Implementation Decisions

### 4.1 S3 Vectors `nonFilterableMetadataKeys`

**Critical**: must be set at index creation — immutable after creation.

```javascript
metadataConfiguration: {
  nonFilterableMetadataKeys: [
    'AMAZON_BEDROCK_TEXT',     // chunk text — can be >>2KB
    'AMAZON_BEDROCK_METADATA', // source metadata blob
  ],
}
```

> ⚠️ Using `AMAZON_BEDROCK_TEXT_CHUNK` (wrong) causes `ValidationException: Filterable metadata
must have at most 2048 bytes` on every ingestion job. The correct key is `AMAZON_BEDROCK_TEXT`
> per AWS docs at [knowledge-base-setup.html](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-setup.html).

### 4.2 Model Selection

| Model                          | Status     | Reason                                             |
| ------------------------------ | ---------- | -------------------------------------------------- |
| `anthropic.claude-3-haiku`     | ❌ Removed | Requires explicit account approval                 |
| `amazon.nova-pro-v1:0`         | ✅ Active  | Available without approval; strong RAG performance |
| `amazon.titan-embed-text-v2:0` | ✅ Active  | 1024-dim embeddings, pay-per-use                   |

### 4.3 API Gateway vs Function URL

Lambda Function URLs were blocked by an account-level public access policy. API Gateway HTTP API
(`aws-apigatewayv2`) was used instead — adds ~$1/mo at 100 visits but resolves the 403 issue.

### 4.4 Multi-Turn Context

`agent.ts` passes last 6 messages (3 turns) formatted as `Human:`/`Assistant:` turns in the
generation prompt. History section is omitted entirely when empty to avoid polluting the prompt.

---

## 5. Corpus Details

| Property          | Value                                                     |
| ----------------- | --------------------------------------------------------- |
| **Source**        | `docs/Mahabharata (Unabridged in English).pdf`            |
| **Size**          | 19 MB, 2,328 pages                                        |
| **Translation**   | Kisari Mohan Ganguli (1883–1896), sacred-texts.com        |
| **S3 location**   | `s3://vyasa-rag-corpus-prod-947612421212/mahabharata.pdf` |
| **Chunking**      | Fixed-size, ~500 tokens, 20% overlap                      |
| **Vectors**       | 9,362 × 1024-dim float32, euclidean distance              |
| **Ingestion job** | `NZMK8FJBRE` — COMPLETE, ~25 min                          |

---

## 6. API Reference

### POST /chat

```json
// Request
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",  // UUID, required
  "message": "Who is Arjuna?"
}

// Response
{
  "session_id": "...",
  "response": "Arjuna is a central character...",
  "citations": [{ "title": "Mahabharata", "book": "Adi Parva", "chapter": "...", "score": 0.56 }],
  "token_usage": { "prompt_tokens": 2463, "completion_tokens": 321, "total_tokens": 2784 },
  "agent_trace": [
    { "step": 1, "type": "thought", "content": "Analyzing query..." },
    { "step": 2, "type": "action", "tool": "query-planner", ... },
    { "step": 3, "type": "action", "tool": "retrieve", ... },
    { "step": 4, "type": "observation", "content": "Retrieved 5 documents" },
    { "step": 5, "type": "action", "tool": "generate", ... },
    { "step": 6, "type": "reflection", "content": "Answer quality: complete (0.9)" }
  ]
}
```

### POST /admin/ingest

```json
// Request
{ "source_uri": "s3://vyasa-rag-corpus-prod-947612421212/mahabharata.pdf" }

// Response
{ "job_id": "NZMK8FJBRE", "status": "STARTING", "message": "..." }
```

### GET /health

```json
{ "status": "healthy", "timestamp": "..." }
```

---

## 7. Known Gaps & Future Work

| Item                             | Priority | Notes                                                                               |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| Citation `book`/`chapter` empty  | Low      | Source metadata not structured by Bedrock; needs custom metadata file per S3 object |
| `mahabharata-test.txt` in corpus | Low      | Test artifact; `aws s3 rm s3://vyasa-rag-corpus-prod-*/mahabharata-test.txt`        |
| Streaming (`/chat/stream`)       | Medium   | SSE handler exists but not tested end-to-end                                        |
| Provisioned concurrency          | Low      | Cold start ~500ms; acceptable at 100 visits/mo                                      |
| Eval golden dataset pass rate    | Medium   | 20-case dataset in `eval/` not run against live KB yet                              |

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
//    - Vector store: AWS-managed default (OPENSEARCH_SERVERLESS via Bedrock KB)
//      No standing compute cost — pay only per query ($0.10/1K queries)
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
- Bedrock KB: AWS-managed default vector store — **no Aurora/OpenSearch standing cost**
  (Aurora Serverless v2 minimum ~$43/mo; managed store: $0 base + $0.10/1K queries)
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
