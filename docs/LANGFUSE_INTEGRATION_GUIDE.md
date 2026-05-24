# Langfuse Integration Guide

A comprehensive guide for replicating the Vyasa Intelligence Langfuse integration in a different tech stack.

## Overview

This project uses **Langfuse** for LLM observability, prompt management, and RAG quality evaluation. The integration spans four key areas:

1. **Tracing & Observability** — Auto-tracing of LLM calls via `@observe` decorators
2. **Prompt Management** — Versioned system prompts stored and retrieved from Langfuse
3. **Evaluation** — Datasets + Experiments + Evaluators for measuring RAG quality
4. **Client Integration** — Wrapped Azure OpenAI client for automatic trace capture

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Vyasa Intelligence                             │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │  embed_query │───▶│search_docs   │───▶│filter_context│                  │
│  │  @observe    │    │  @observe    │    │  @observe    │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                             │                               │
│                                             ▼                               │
│                                   ┌──────────────┐                         │
│                                   │generate_resp │                         │
│                                   │  @observe    │                         │
│                                   └──────────────┘                         │
│                                          │                                  │
│                                          ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                        Langfuse Traces                               ││
│  │   - Full RAG pipeline trace tree                                     ││
│  │   - Input/output capture                                             ││
│  │   - Latency/error tracking                                           ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                     Prompt Management                                ││
│  │   get_prompt("vyasa-system-prompt")                                 ││
│  │   prompt.compile(context=...)                                       ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    Evaluation Workflow                               ││
│  │   - Dataset: vyasa-mahabharata-qa-v1                                ││
│  │   - Experiment runs via run_experiment()                            ││
│  │   - RAGAS evaluators (faithfulness, relevancy, correctness)         ││
│  │   - Custom citation_accuracy evaluator                              ││
│  └──────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │   Langfuse UI    │
                          │  (cloud or self) │
                          └──────────────────┘
```

## Core Components

### 1. Client Setup (App-Level Integration)

**Key Files:** `app.py`

**Concept:** Initialize a Langfuse-wrapped LLM client at app startup. The wrapper auto-traces all API calls.

**Python Implementation:**

```python
from langfuse.openai import AzureOpenAI  # Wrapped client
from langfuse import observe, get_client  # Decorator + client access

# Initialize clients once at startup
def init_clients():
    # The Langfuse-wrapped client automatically traces:
    # - Request/response payloads
    # - Token usage
    # - Latency
    # - Errors
    azure_client = AzureOpenAI(
        azure_endpoint="...",
        api_key="...",
        api_version="2024-10-21"
    )
    return azure_client

# Shutdown: flush any buffered traces
# get_client().flush()
```

**How to Port to Other Stacks:**

| Stack                  | Approach                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| **Node.js/TypeScript** | Use `langfuse-vercel` for Next.js or `langfuse` SDK directly. Wrap OpenAI client with `observeOpenAI()` |
| **Java**               | Use `langfuse-java` SDK. Implement `LangfuseClient` and wrap HTTP calls with trace/span creation        |
| **Go**                 | Use `langfuse-go` SDK. Create middleware that captures request/response in `Trace`/`Span` objects       |
| **Ruby**               | Use `langfuse-ruby` gem. Create `Langfuse::Trace` wrapper around OpenAI gem calls                       |

**Critical Pattern:** The wrapped client must be used throughout the application (not the raw client) to ensure all LLM calls are traced.

---

### 2. Function-Level Tracing with `@observe`

**Key Files:** `app.py`, `scripts/eval_task.py`

**Concept:** Use the `@observe(name="...")` decorator to auto-trace any function.

**Python Implementation:**

```python
from langfuse import observe

@observe(name="embed-query")
def embed_query(client, deployment, text):
    response = client.embeddings.create(model=deployment, input=text)
    return response.data[0].embedding

@observe(name="search-documents")
def search_documents(search_client, query_vector, text, top=5):
    # Search implementation
    return results

@observe(name="filter-and-build-context")
def filter_and_build_context(results, threshold_ratio=0.75):
    # Filter implementation
    return context, citations

@observe(name="generate-response")
def generate_response(client, deployment, context, text, session_id):
    # Generation implementation
    return assistant_reply
```

**Output:** A hierarchical trace tree in Langfuse UI:

```
Trace: generate-response
├── Span: embed-query (latency: 120ms)
├── Span: search-documents (latency: 45ms)
├── Span: filter-and-build-context (latency: 2ms)
└── Span: generate-response (latency: 1850ms)
    └── Generation: GPT-4o-mini (tokens: 450)
```

**How to Port to Other Stacks:**

| Stack          | Pattern                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| **Node.js**    | Use `langfuse.trace()` + `langfuse.span()` manually, or `withLangfuse` HOC |
| **TypeScript** | Decorators aren't native — use `wrapInSpan()` utility or middleware        |
| **Java**       | Use `@Traced` annotation from `langfuse-java` or manual `trace.span()`     |
| **Go**         | Use `defer span.End()` pattern around function calls                       |
| **Rust**       | Use `#[tracing::instrument]` with custom Langfuse subscriber               |

---

### 3. Prompt Management

**Key Files:** `app.py` (lines 284-289, 338-340)

**Concept:** Store and version system prompts in Langfuse UI, retrieve at runtime.

**Python Implementation:**

```python
from langfuse import get_client

def _prepare_messages(context: str, text: str, session_id: str):
    """Build messages using versioned prompt from Langfuse."""
    langfuse = get_client()

    # 1. Retrieve prompt (cached by Langfuse SDK)
    prompt = langfuse.get_prompt("vyasa-system-prompt", type="chat")

    # 2. Compile with variables
    system_messages: list[Any] = list(prompt.compile(context=context))

    # 3. Build full message history
    history = conversations[session_id]
    if not history:
        history.extend(system_messages)
    else:
        history[0] = system_messages[0]  # Refresh system message

    history.append({"role": "user", "content": text})

    return history, prompt
```

**LLM Call with Prompt Tracking:**

```python
# Pass the prompt object to link this generation to the prompt version
stream = client.chat.completions.create(
    model=deployment,
    messages=history,
    langfuse_prompt=prompt,  # <-- Links generation to prompt version
)
```

**Setup in Langfuse UI:**

1. Navigate to **Prompts** → **+ New prompt**
2. Name: `vyasa-system-prompt`
3. Type: `chat`
4. Template:
   ```json
   [
     {
       "role": "system",
       "content": "You are Vyasa, the author of the Mahabharata. Answer questions using only the provided context.\n\nContext:\n{{context}}"
     }
   ]
   ```
5. Save → Langfuse auto-versions (v1, v2, etc.)

**How to Port to Other Stacks:**

| Stack              | Approach                                                            |
| ------------------ | ------------------------------------------------------------------- |
| **Node.js**        | `await langfuse.getPrompt("vyasa-system-prompt", { type: "chat" })` |
| **Any HTTP stack** | Direct API: `GET /api/public/v2/prompts/vyasa-system-prompt`        |

**Benefits:**

- A/B test prompt versions
- Rollback to previous prompts
- Track which prompt version produced each generation

---

### 4. Evaluation System (Datasets + Experiments)

**Key Files:** `scripts/upload_dataset.py`, `scripts/run_eval.py`, `scripts/eval_task.py`, `tests/test_eval_task.py`

**Concept:** Use Langfuse's native evaluation framework for measuring RAG quality.

**Architecture:**

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Dataset       │────▶│   Experiment    │────▶│   Evaluators    │
│ (golden Q/A)    │     │ (run pipeline)  │     │ (score output)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       │                        │                       │
       ▼                        ▼                       ▼
  10 labeled items        Task runs pipeline    RAGAS + custom
  (question, answer)      Returns: output      scores attached
                          context              to each run
                          citations
                          token_usage
```

**Step 1: Upload Dataset (One-Time)**

```python
from langfuse import get_client

def upload(dataset_name: str, local_path: Path) -> None:
    langfuse = get_client()

    # Create dataset (idempotent — safe to re-run)
    try:
        langfuse.create_dataset(
            name=dataset_name,
            description="Labeled Q/A pairs for RAG quality eval.",
        )
    except Exception:
        pass  # Dataset exists

    # Upload items with stable IDs (enables upsert)
    for item in items:
        langfuse.create_dataset_item(
            dataset_name=dataset_name,
            id=item["id"],  # <-- Stable ID for idempotency
            input=item["question"],
            expected_output=item["reference_answer"],
            metadata={"tags": item.get("tags", [])},
        )
```

**Step 2: Task Adapter** (bridges your RAG pipeline to Langfuse)

```python
def run_rag_task(*, item: dict, azure_client, search_client,
                 embed_deployment: str, chat_deployment: str) -> dict:
    """Execute RAG pipeline for one dataset item.

    Returns dict with keys:
    - output: str (the answer)
    - context: str (retrieved context)
    - contexts: list[str] (list version for RAGAS)
    - citations: list[dict] (source references)
    - token_usage: dict (token counts)
    """
    question: str = item["input"]
    session_id = get_or_create_session()

    try:
        # Standard RAG pipeline
        query_vector = embed_query(azure_client, embed_deployment, question)
        results = search_documents(search_client, query_vector, question)
        context, citations = filter_and_build_context(results)
        answer, usage = generate_response_api(
            azure_client, chat_deployment, context, question, session_id
        )
    finally:
        # Critical: clean up session between samples
        conversations.pop(session_id, None)

    # Format for Langfuse evaluators
    contexts_list = [c for c in context.split("\n\n") if c.strip()]

    return {
        "output": answer,
        "context": context,
        "contexts": contexts_list,
        "citations": citations,
        "token_usage": usage,
    }
```

**Step 3: Run Experiment**

```python
from langfuse import get_client

def run_experiment(dataset_name: str, task: Callable) -> None:
    langfuse = get_client()
    dataset = langfuse.get_dataset(dataset_name)
    items = list(dataset.items)

    run_name = f"rag-eval-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

    result = langfuse.run_experiment(
        name=run_name,
        description="RAG quality evaluation",
        data=items,
        task=task,
        # evaluators=[]  # Optional: pass custom evaluators inline
    )

    langfuse.flush()
    print(result.format())
```

**Step 4: Configure Evaluators (In Langfuse UI)**

Navigate to **Evaluators** → Create new evaluators targeting "Experiment runs":

| Evaluator                  | Type            | Purpose                                   |
| -------------------------- | --------------- | ----------------------------------------- |
| `ragas_faithfulness`       | Managed (RAGAS) | Are claims grounded in retrieved context? |
| `ragas_answer_relevancy`   | Managed (RAGAS) | Is answer relevant to question?           |
| `ragas_answer_correctness` | Managed (RAGAS) | Is answer correct vs. expected?           |
| `citation_accuracy`        | Custom          | Do citations support the claims?          |

**Custom Evaluator Implementation:**

```python
from langfuse import Evaluation

def citation_accuracy_evaluator(*, input, output, expected_output, metadata, **_):
    """Custom evaluator — called by Langfuse after each task run."""
    meta = metadata or {}
    context = meta.get("context", "")
    citations = meta.get("citations", [])

    # Deterministic short-circuit: correct abstention
    if context.strip() == "No relevant passages found." and not citations:
        return Evaluation(
            name="citation_accuracy",
            value=1.0,
            comment="Correct abstention — no context, no citations.",
        )

    # LLM-as-judge for citation accuracy
    # (Uses separate judge model to avoid self-evaluation bias)
    score = call_judge_llm(input, output, context, citations)

    return Evaluation(
        name="citation_accuracy",
        value=score,
        comment="Judge LLM evaluation complete",
    )
```

**How to Port to Other Stacks:**

The evaluation framework is Langfuse-specific, but the **task adapter pattern** is universal:

| Stack       | Task Adapter Pattern                                                                         |
| ----------- | -------------------------------------------------------------------------------------------- |
| **Node.js** | Export `async function runRagTask(item, clients) => { output, context, citations }`          |
| **Java**    | Implement `RagTask` interface with `execute(DatasetItem) -> TaskResult`                      |
| **Go**      | Define `func RunRagTask(ctx context.Context, item DatasetItem, clients Clients) TaskResult`  |
| **Any**     | The return shape must match what evaluators expect: `{output, context, contexts, citations}` |

---

## Environment Variables

Required for Langfuse integration:

```bash
# Langfuse authentication
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_HOST=https://cloud.langfuse.com  # Or self-hosted URL

# Azure OpenAI (or your LLM provider)
AZURE_OAI_ENDPOINT=https://...openai.azure.com/
AZURE_OAI_KEY=...
AZURE_OAI_DEPLOYMENT=text-embedding-3-large
AZURE_OAI_CHAT_DEPLOYMENT=gpt-4o-mini
AZURE_OAI_JUDGE_DEPLOYMENT=gpt-4o  # Optional: stronger model for eval

# Vector database
AZURE_SEARCH_ENDPOINT=https://...search.windows.net
AZURE_SEARCH_KEY=...
AZURE_SEARCH_INDEX=mahabharata-index
```

**Porting Guide:**

| Variable         | Purpose          | When Porting                                               |
| ---------------- | ---------------- | ---------------------------------------------------------- |
| `LANGFUSE_*`     | Auth to Langfuse | Keep same regardless of stack                              |
| `AZURE_OAI_*`    | LLM provider     | Replace with your provider's vars (e.g., `OPENAI_API_KEY`) |
| `AZURE_SEARCH_*` | Vector DB        | Replace with your DB's vars (e.g., `PINECONE_API_KEY`)     |

---

## Testing the Integration

**Unit Tests for Task Adapter:** (Python example, pattern applies to all stacks)

```python
def test_run_rag_task_returns_langfuse_shape(mocker):
    """Verify adapter returns correct shape for Langfuse evaluators."""
    # Arrange — stub all dependencies
    mocker.patch("embed_query", return_value=[0.1, 0.2, 0.3])
    mocker.patch("search_documents", return_value=[{"title": "...", "chunk": "..."}])
    mocker.patch("filter_and_build_context", return_value=("context", [{"title": "..."}]))
    mocker.patch("generate_response_api", return_value=("answer", {"total_tokens": 15}))

    # Act
    result = run_rag_task(
        item={"input": "Who was Karna?", "expected_output": "A warrior."},
        azure_client=MagicMock(),
        search_client=MagicMock(),
        embed_deployment="text-embedding-3-large",
        chat_deployment="gpt-5-mini",
    )

    # Assert — contract for Langfuse evaluators
    assert result["output"] == "answer"
    assert result["context"] == "context"
    assert result["contexts"] == ["context"]
    assert result["citations"] == [{"title": "..."}]
    assert result["token_usage"]["total_tokens"] == 15
```

**Integration Test:**

```bash
# 1. Run unit tests
uv run pytest tests/test_eval_task.py -v

# 2. Upload dataset (one-time)
uv run python scripts/upload_dataset.py

# 3. Run eval (smoke test — 3 items)
uv run python scripts/run_eval.py --limit 3

# 4. Verify in Langfuse UI
#    → Datasets → vyasa-mahabharata-qa-v1
#    → Experiments → Latest run
#    → Scores should appear
```

---

## Common Pitfalls

| Pitfall                             | Solution                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Wrong client used**               | Ensure the `langfuse.openai.AzureOpenAI` wrapped client is used everywhere, not the raw OpenAI client |
| **Missing `langfuse_prompt` param** | Pass the retrieved prompt object to LLM calls so Langfuse links generation → prompt version           |
| **Session leaks in eval**           | Always clean up sessions between dataset items (`conversations.pop(session_id, None)`)                |
| **Self-evaluation bias**            | Use a separate (stronger) judge model for evaluation, not the same model being evaluated              |
| **No flush on shutdown**            | Call `get_client().flush()` at app shutdown to ensure all traces are sent                             |
| **Wrong evaluator target**          | In Langfuse UI, set evaluators to target "Experiment runs" not "Traces"                               |

---

## Migration Checklist (For Different Tech Stack)

When porting this Langfuse integration to a new stack:

- [ ] Install Langfuse SDK for your language
- [ ] Install Langfuse-wrapped LLM client (or implement wrapper)
- [ ] Add `@observe` equivalent decorators/middleware
- [ ] Create `init_clients()` that returns Langfuse-wrapped client
- [ ] Add shutdown hook with `get_client().flush()`
- [ ] Create prompt in Langfuse UI → retrieve in code
- [ ] Implement task adapter: `run_rag_task(item) -> {output, context, contexts, citations}`
- [ ] Write unit tests for task adapter (mock all dependencies)
- [ ] Implement custom evaluator for citation accuracy
- [ ] Create upload script for dataset (one-time)
- [ ] Create run script for experiments
- [ ] Configure evaluators in Langfuse UI (RAGAS + custom)
- [ ] Test end-to-end: upload → run → verify scores in UI

---

## References

- **Langfuse Docs:** https://langfuse.com/docs
- **Langfuse Python SDK:** https://langfuse.com/docs/sdk/python
- **Evaluation with Datasets:** https://langfuse.com/docs/evaluation/experiments/datasets
- **RAGAS Integration:** https://langfuse.com/docs/evaluation/ragas
- **Prompt Management:** https://langfuse.com/docs/prompts

## Files Reference

| File                        | Purpose                                                             | Lines of Interest       |
| --------------------------- | ------------------------------------------------------------------- | ----------------------- |
| `app.py`                    | Main app with `@observe` decorators, prompt retrieval, client setup | 20-34, 154-198, 216-421 |
| `scripts/eval_task.py`      | Task adapter for Langfuse experiments                               | 1-82                    |
| `scripts/upload_dataset.py` | Dataset upload script                                               | 1-68                    |
| `scripts/run_eval.py`       | Experiment runner                                                   | 1-107                   |
| `tests/test_eval_task.py`   | Unit tests for task adapter                                         | 1-74                    |

---

_This guide is derived from the Vyasa Intelligence RAG system. Adapt patterns to your specific stack while maintaining the core observability and evaluation principles._
