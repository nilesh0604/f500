# Vyasa RAG Evaluation System

## Overview

Comprehensive evaluation framework for measuring RAG quality across accuracy, citations, and latency.

## Components

| Component                      | Description                                             |
| ------------------------------ | ------------------------------------------------------- |
| `datasets/golden-dataset.json` | 20 curated test cases with expected answers             |
| `metrics/evaluator.ts`         | Scoring functions for accuracy, completeness, citations |
| `runner.ts`                    | Test execution engine with HTML/JSON reports            |
| `feedback.ts`                  | Human feedback collection and analysis                  |

## Golden Dataset

**Categories:**

- **single_hop** (7): Direct factual questions
- **multi_hop** (6): Multi-step reasoning
- **complex_reasoning** (4): Synthesis questions
- **edge_cases** (3): Out-of-scope boundary tests

**Difficulties:** Easy (7), Medium (6), Hard (7)

**Sample test case:**

```json
{
  "id": "test-004",
  "category": "multi_hop",
  "query": "Who were the parents of Karna's foster father?",
  "expected_answer": "Adhiratha's parents - requires finding Adhiratha's lineage",
  "required_facts": [
    "Karna was raised by Adhiratha",
    "Adhiratha was a charioteer",
    "Adhiratha's parentage"
  ],
  "difficulty": "hard"
}
```

## Evaluation Metrics

| Metric           | Weight | Description                          |
| ---------------- | ------ | ------------------------------------ |
| **Accuracy**     | 35%    | Keyword overlap with expected answer |
| **Citation F1**  | 20%    | Precision/recall of source citations |
| **Completeness** | 20%    | Coverage of required facts           |
| **Relevance**    | 15%    | Query term presence in answer        |
| **Conciseness**  | 10%    | Appropriate answer length            |

**Pass thresholds by difficulty:**

- Easy: 80% accuracy, 80% completeness, 75% overall
- Medium: 70% accuracy, 70% completeness, 70% overall
- Hard: 60% accuracy, 60% completeness, 65% overall

## Usage

### Run Evaluation

```bash
# Full dataset
cd apps/vyasa-rag-service
npx ts-node eval/runner.ts eval/datasets/golden-dataset.json eval/reports/results.json

# Sample (for quick testing)
SAMPLE_SIZE=5 npx ts-node eval/runner.ts

# Filter by category
# Edit runner.ts config: categories: ['single_hop']
```

### View Results

```bash
# Open HTML report
open eval/reports/results.html

# JSON for programmatic analysis
cat eval/reports/results.json | jq '.summary'
```

### Human Feedback

```typescript
import { submitFeedback } from './eval/feedback';

await submitFeedback(
  sessionId,
  query,
  response,
  4, // rating 1-5
  true, // helpful
  true, // accurate
  'Optional comments'
);
```

### Get Feedback Stats

```bash
npx ts-node -e "
  import { getFeedbackStats } from './eval/feedback';
  const stats = await getFeedbackStats(30);
  console.log(stats);
"
```

## Reports

### HTML Report

- Summary metrics (pass rate, avg score, latency)
- Detailed results table
- Failed test analysis

### JSON Report

```json
{
  "timestamp": "2026-05-22T...",
  "summary": {
    "total": 20,
    "passed": 15,
    "passRate": 0.75,
    "avgScore": 0.78,
    "avgLatency": 2450
  },
  "results": [...]
}
```

## CI Integration

```yaml
# .github/workflows/eval.yml
- name: Run Evaluation
  run: npx ts-node eval/runner.ts

- name: Check Pass Rate
  run: |
    PASS_RATE=$(jq -r '.summary.passRate' eval/reports/results.json)
    if (( $(echo "$PASS_RATE < 0.70" | bc -l) )); then
      echo "Pass rate $PASS_RATE below threshold 70%"
      exit 1
    fi
```

## Adding Test Cases

1. Add entry to `datasets/golden-dataset.json`
2. Include: query, expected_answer, required_facts, difficulty
3. Run evaluation to validate
4. Update statistics in dataset metadata
