# AWS Infrastructure Cost Analysis

> **Last Updated:** May 2026  
> **Scope:** OrderFlow + Vyasa Intelligence — All deployed stacks (UI + Backend)  
> **Region:** `us-east-1`  
> **Assumption:** Moderate workload, ~730 hrs/month, ~10K API requests/day

---

## Architecture Summary

Two product domains deployed on this account:

| Domain                            | Stack Count | Primary Services                                                      |
| --------------------------------- | ----------- | --------------------------------------------------------------------- |
| **OrderFlow** (ECS backend)       | 10 stacks   | VPC, RDS, Redis, ECS Fargate, ALB, CDN, SQS, WAF, AppConfig, Rollback |
| **Vyasa Intelligence** (RAG + UI) | 3 stacks    | S3 Vectors, Lambda, API Gateway, Bedrock, DynamoDB, CloudFront, S3    |

---

## Cost Breakdown (Single Prod Environment)

> **Note:** This project uses a single `prod` environment only. Dev/staging configurations were removed per ADR-011.

| Service                              | Configuration                      | Monthly Est.          |
| ------------------------------------ | ---------------------------------- | --------------------- |
| **VPC / NAT Gateways**               | 2 NAT GWs, 3 AZs                   | $70                   |
| **RDS PostgreSQL**                   | `db.t3.medium`, 100 GB, Multi-AZ   | $190                  |
| **ElastiCache Redis**                | `cache.t3.small`, 1 replica        | $50                   |
| **ECS Fargate** (order-svc)          | 1024 CPU / 2048 MB × 2 tasks (min) | $65                   |
| **ECS Fargate** (notification-svc)   | 1024 CPU / 2048 MB × 2 tasks (min) | $65                   |
| **ALB**                              | ~5 LCU avg                         | $25                   |
| **CloudFront CDN** (OrderFlow)       | PriceClass_All                     | $15                   |
| **SQS**                              | 4 queues                           | $3                    |
| **Secrets Manager**                  | 2 secrets                          | $1                    |
| **WAF**                              | Enabled, higher traffic            | $25                   |
| **VPC Flow Logs**                    | ~20 GB/month                       | $10                   |
| **Vyasa Lambda**                     | 1024 MB, ARM64, ~100K req/day      | $15                   |
| **API Gateway HTTP**                 | ~100K req/day                      | $10                   |
| **Bedrock** (Nova Pro + Titan Embed) | ~10K queries/day, streaming        | $300–500              |
| **S3 Vectors**                       | ~50K+ vectors                      | $10–20                |
| **DynamoDB** (PITR enabled)          | PAY_PER_REQUEST + PITR             | $15                   |
| **S3** (corpus RETAIN + versioning)  | ~10 GB                             | $3                    |
| **CloudFront** (Vyasa UI)            | PriceClass_All                     | $15                   |
| **CloudWatch**                       | 90-day retention, detailed         | $40                   |
| **X-Ray + Synthetics**               | Full tracing + canaries            | $25                   |
| **AppConfig**                        | Config deployments                 | $1                    |
| **Rollback Lambda**                  | CloudWatch Alarm triggered         | $1                    |
|                                      | **TOTAL**                          | **~$954–1,148/month** |

---

## Cost Summary

| Environment | Low Est. | High Est. | Notes                                  |
| ----------- | -------- | --------- | -------------------------------------- |
| **Prod**    | $954     | $1,148    | Bedrock inference is largest line item |

---

## Cost Drivers & Optimization Opportunities

### 🔴 High-Impact (>$50/month savings potential)

| Issue                                     | Saving                  | Recommendation                                                                                      |
| ----------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| **Bedrock Nova Pro inference**            | $100–300/month          | Implement response caching (Redis/DynamoDB) for repeated Mahabharata queries; cache TTL = 24h       |
| **Multi-AZ NAT Gateways (Pre-Prod/Prod)** | $35/month               | Route S3/DynamoDB/Lambda traffic via VPC Endpoints (Gateway type = free) to reduce NAT data charges |
| **Multi-AZ RDS (Pre-Prod/Prod)**          | Already sized correctly | Enable RDS Proxy in prod to pool connections from ECS tasks                                         |
| **ECS Auto-scaling idle**                 | $30–60/month            | Scale down to 0 tasks in dev/staging on nights/weekends using scheduled scaling                     |

### 🟡 Medium-Impact ($10–50/month savings potential)

| Issue                           | Saving       | Recommendation                                                                 |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| **CloudWatch log retention**    | $10–20/month | Dev logs already at 7-day; verify Container Insights sampling rate in staging  |
| **S3 corpus bucket versioning** | $5–15/month  | Non-current version expiry already set at 30 days — verify lifecycle is active |
| **Titan Embeddings (re-sync)**  | $10–30/sync  | Only run Bedrock ingestion jobs when corpus changes, not on every deploy       |
| **X-Ray sampling rate**         | $5–15/month  | Reduce X-Ray sampling to 5% in prod; 100% is expensive at scale                |

### 🟢 Low-Impact (free or minimal)

| Item                              | Notes                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------- |
| **S3 Vectors**                    | New service, pay per vector stored + query — currently low cost at ~50K vectors |
| **DynamoDB PAY_PER_REQUEST**      | Correct mode for unpredictable/low traffic — no change needed                   |
| **API Gateway HTTP**              | Cheapest gateway tier; correct choice                                           |
| **CloudFront PriceClass mapping** | Dev/staging on PriceClass_100, prod on PriceClass_All — correctly tiered        |

---

## Bedrock Cost Detail (Biggest Variable)

**Amazon Nova Pro v1** (model used for RAG):

- Input: $0.0008 / 1K tokens
- Output: $0.0032 / 1K tokens
- Avg query: ~2K input + ~500 output tokens = ~$0.0032/query

**Amazon Titan Embed Text v2**:

- $0.00002 / 1K tokens (embedding)

| Env  | Queries/Day | Embed Syncs      | Monthly Bedrock Cost |
| ---- | ----------- | ---------------- | -------------------- |
| Prod | 10,000+     | On corpus change | $300–500             |

> **Key optimization**: Cache frequent RAG responses. Mahabharata content is static — identical questions from different users waste inference budget. A DynamoDB TTL cache on the `(question_hash, kb_id)` key can cut Bedrock costs by **30–50%**.

---

## Quick Wins Checklist

- [ ] Add VPC Gateway Endpoints for S3 and DynamoDB (free, reduces NAT data charges)
- [ ] Implement RAG response caching in `vyasa-rag-service` with 24h TTL
- [ ] Reduce Bedrock ingestion jobs to fire only on S3 corpus change events (S3 Event → Lambda trigger)
- [ ] Enable AWS Cost Anomaly Detection on `CostCenter: learning` tag filter
- [ ] Set AWS Budgets alert at $1,200/month for prod environment

---

## AWS Budget Alarm Already Configured

The `VyasaLambdaStack` includes a CloudWatch alarm at **$8 threshold**
(`vyasa-rag-budget-{env}`) — this only covers Vyasa RAG billing.

**Recommended**: Create an AWS Budgets alert (not CloudWatch) for total account spend
at `$1,500/month` to catch runaway costs across all stacks.

---

_Generated from CDK stack analysis: `config` (prod), `vyasa-lambda-stack.ts`, `vyasa-ui-stack.ts`, `vyasa-vector-stack.ts`, `ecs-stack.ts`, `database-stack.ts`, `network-stack.ts`, `security-stack.ts`_
