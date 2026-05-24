# Langfuse Integration for Vyasa RAG Evaluation

This directory contains the Langfuse integration for running the evaluation framework against the live API and capturing baseline scores.

## Overview

The Langfuse integration provides:

1. **Dataset Management** - Upload golden dataset to Langfuse
2. **Experiment Runner** - Execute evaluation runs against live API
3. **Task Adapter** - Bridge between RAG API and Langfuse evaluators
4. **Baseline Capture** - Capture and track performance metrics over time

## Environment Setup

**Important:** This project has two deployment targets:

| Environment          | Endpoint                                                      | Use Case                                      |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| **Local Dev Server** | `http://localhost:3000/chat`                                  | Local testing (connects to real AWS services) |
| **Production API**   | `https://t859xz8d3c.execute-api.us-east-1.amazonaws.com/chat` | Live baseline evaluation                      |

### Environment Variables

Add to your `.env.local` file:

```bash
# Langfuse authentication (required)
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_HOST=https://cloud.langfuse.com  # Or self-hosted URL

# API endpoint for evaluation (optional - defaults shown above)
VYASA_API_ENDPOINT=https://t859xz8d3c.execute-api.us-east-1.amazonaws.com/chat
VYASA_API_KEY=your_api_key_if_required
VYASA_API_TIMEOUT=30000

# For local dev server testing, set:
EVAL_LOCAL=true
```

### Install Dependencies

```bash
npm install langfuse axios
```

## Usage

### 1. Upload Dataset (One-time)

Upload the golden dataset to Langfuse:

```bash
cd apps/vyasa-rag-service
npx ts-node eval/langfuse/upload-dataset.ts
```

This creates the `vyasa-mahabharata-qa-v1` dataset in Langfuse with all 20 test cases.

### 2. Run Evaluation

Execute the evaluation against the live API:

```bash
# Full evaluation (all 20 test cases)
npx ts-node eval/langfuse/run-experiment.ts

# Smoke test (3 items only)
npx ts-node eval/langfuse/run-experiment.ts --smoke

# Custom limit
npx ts-node eval/langfuse/run-experiment.ts --limit 5
```

### 3. View Results

Navigate to your Langfuse UI:

- **Datasets** → `vyasa-mahabharata-qa-v1`
- **Experiments** → View latest run

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Dataset       │────▶│   Experiment    │────▶│   Live API      │
│ (golden Q/A)    │     │ (run pipeline)  │     │ (vyasa-rag)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       │                        │                       │
       ▼                        ▼                       ▼
  Langfuse UI              Trace/Scores           Response
                                                  + Citations
```

## Files

| File                | Purpose                           |
| ------------------- | --------------------------------- |
| `client.ts`         | Langfuse client initialization    |
| `upload-dataset.ts` | Upload golden dataset to Langfuse |
| `task-adapter.ts`   | Bridge RAG API to Langfuse format |
| `run-experiment.ts` | Execute evaluation runs           |

## Baseline Scores

After running the experiment, capture these metrics as your baseline:

| Metric       | Target | Weight |
| ------------ | ------ | ------ |
| Accuracy     | > 75%  | 35%    |
| Citation F1  | > 70%  | 20%    |
| Completeness | > 70%  | 20%    |
| Relevance    | > 75%  | 15%    |
| Conciseness  | > 80%  | 10%    |

## MCP Server Integration (Windsurf)

The Langfuse MCP server is configured in `.mcp.json` to read results directly from Windsurf.

### Setup

1. **Generate MCP Auth Token:**

   ```bash
   echo -n "pk-lf-your-public-key:sk-lf-your-secret-key" | base64
   ```

2. **Add to Environment:**

   ```bash
   export LANGFUSE_MCP_AUTH="your-base64-encoded-string"
   ```

3. **Restart Windsurf** to load the MCP server.

### Available MCP Tools

Once connected, you can ask me to:

- **List datasets:** "Show me all Langfuse datasets"
- **View experiments:** "Show experiments for vyasa-mahabharata-qa-v1"
- **Get traces:** "Show recent traces from the latest experiment"
- **Read prompts:** "List all prompts in the project"
- **Get scores:** "Show evaluation scores for the baseline run"

### Example Queries

```
"List all datasets in Langfuse"
"Show me the latest experiment results for vyasa-mahabharata-qa-v1"
"What was the average score for the last evaluation run?"
"Show traces with errors from the most recent experiment"
```

## CI Integration

```yaml
# .github/workflows/eval.yml
- name: Run Langfuse Evaluation
  run: |
    cd apps/vyasa-rag-service
    npx ts-node eval/langfuse/run-experiment.ts --smoke
  env:
    LANGFUSE_PUBLIC_KEY: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
    LANGFUSE_SECRET_KEY: ${{ secrets.LANGFUSE_SECRET_KEY }}
```

## Troubleshooting

| Issue                 | Solution                                               |
| --------------------- | ------------------------------------------------------ |
| Authentication errors | Verify `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` |
| API timeout           | Increase `VYASA_API_TIMEOUT` in environment            |
| Dataset not found     | Run `upload-dataset.ts` first                          |
| Missing traces        | Check `flushLangfuse()` is called                      |
