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

## Per-Environment Cost Breakdown

### DEV Environment

| Service                                | Configuration                         | Monthly Est.        |
| -------------------------------------- | ------------------------------------- | ------------------- |
| **VPC / NAT Gateway**                  | 1 NAT GW, 2 AZs                       | $35                 |
| **RDS PostgreSQL**                     | `db.t3.micro`, 20 GB, no Multi-AZ     | $15                 |
| **ElastiCache Redis**                  | `cache.t3.micro`, 0 replicas          | $13                 |
| **ECS Fargate** (order-svc)            | 256 CPU / 512 MB × 1 task             | $8                  |
| **ECS Fargate** (notification-svc)     | 256 CPU / 512 MB × 1 task             | $8                  |
| **ALB**                                | 1 LCU avg                             | $18                 |
| **CloudFront CDN** (OrderFlow)         | PriceClass_100, low traffic           | $2                  |
| **SQS**                                | 2 queues + 2 DLQs                     | <$1                 |
| **Secrets Manager**                    | 2 secrets                             | $1                  |
| **AppConfig**                          | Free tier                             | $0                  |
| **Vyasa Lambda**                       | 1024 MB, ARM64, ~10K req/day          | $2                  |
| **API Gateway HTTP**                   | ~10K req/day                          | $1                  |
| **Bedrock KB + Titan Embeddings**      | Nova Pro inference (~500 queries/day) | $30–60              |
| **S3 Vectors (vector index)**          | ~50K vectors, 1024-dim                | $5–10               |
| **DynamoDB** (sessions + rate limits)  | PAY_PER_REQUEST, low traffic          | $1                  |
| **S3** (corpus + prompts + UI buckets) | ~2 GB total                           | $1                  |
| **CloudFront** (Vyasa UI)              | PriceClass_100, low traffic           | $2                  |
| **CloudWatch Logs + Alarms**           | 7-day retention                       | $3                  |
| **X-Ray Tracing**                      | Lambda active tracing                 | $1                  |
| **WAF**                                | Disabled in dev                       | $0                  |
|                                        | **DEV TOTAL**                         | **~$147–177/month** |

---

### STAGING Environment

| Service                              | Configuration                         | Monthly Est.        |
| ------------------------------------ | ------------------------------------- | ------------------- |
| **VPC / NAT Gateway**                | 1 NAT GW, 2 AZs                       | $35                 |
| **RDS PostgreSQL**                   | `db.t3.small`, 20 GB, no Multi-AZ     | $30                 |
| **ElastiCache Redis**                | `cache.t3.micro`, 0 replicas          | $13                 |
| **ECS Fargate** (order-svc)          | 512 CPU / 1024 MB × 1 task            | $16                 |
| **ECS Fargate** (notification-svc)   | 512 CPU / 1024 MB × 1 task            | $16                 |
| **ALB**                              | 1 LCU avg                             | $18                 |
| **CloudFront CDN** (OrderFlow)       | PriceClass_100                        | $3                  |
| **SQS**                              | 2 queues + 2 DLQs                     | $1                  |
| **Secrets Manager**                  | 2 secrets                             | $1                  |
| **WAF**                              | Enabled, ~50K web ACL requests/day    | $15                 |
| **VPC Flow Logs**                    | ~5 GB/month                           | $3                  |
| **Vyasa Lambda**                     | 1024 MB, ARM64                        | $3                  |
| **API Gateway HTTP**                 | ~20K req/day                          | $2                  |
| **Bedrock** (Nova Pro + Titan Embed) | ~1K queries/day                       | $50–90              |
| **S3 Vectors**                       | ~50K vectors                          | $5–10               |
| **DynamoDB**                         | PAY_PER_REQUEST                       | $2                  |
| **S3** (all buckets)                 | ~3 GB                                 | $1                  |
| **CloudFront** (Vyasa UI)            | PriceClass_100                        | $3                  |
| **CloudWatch**                       | 14-day retention, detailed monitoring | $8                  |
| **X-Ray**                            | Lambda + Container Insights           | $5                  |
|                                      | **STAGING TOTAL**                     | **~$230–270/month** |

---

### PRE-PROD Environment

| Service                              | Configuration                        | Monthly Est.        |
| ------------------------------------ | ------------------------------------ | ------------------- |
| **VPC / NAT Gateways**               | 2 NAT GWs, 2 AZs                     | $70                 |
| **RDS PostgreSQL**                   | `db.t3.medium`, 50 GB, Multi-AZ      | $120                |
| **ElastiCache Redis**                | `cache.t3.small`, 1 replica          | $50                 |
| **ECS Fargate** (order-svc)          | 1024 CPU / 2048 MB × 2 tasks         | $65                 |
| **ECS Fargate** (notification-svc)   | 1024 CPU / 2048 MB × 2 tasks         | $65                 |
| **ALB**                              | ~3 LCU avg                           | $20                 |
| **CloudFront CDN**                   | PriceClass_200                       | $5                  |
| **SQS**                              | 4 queues                             | $2                  |
| **Secrets Manager**                  | 2 secrets                            | $1                  |
| **WAF**                              | Enabled                              | $15                 |
| **VPC Flow Logs**                    | ~10 GB/month                         | $5                  |
| **Vyasa Lambda**                     | 1024 MB, ARM64, ~50K req/day         | $8                  |
| **API Gateway HTTP**                 | ~50K req/day                         | $5                  |
| **Bedrock** (Nova Pro + Titan Embed) | ~5K queries/day                      | $150–250            |
| **S3 Vectors**                       | ~50K vectors                         | $5–10               |
| **DynamoDB**                         | PAY_PER_REQUEST                      | $5                  |
| **S3** (all buckets)                 | ~5 GB                                | $2                  |
| **CloudFront** (Vyasa UI)            | PriceClass_200                       | $5                  |
| **CloudWatch**                       | 30-day retention, Container Insights | $20                 |
| **X-Ray + Synthetics**               | Active tracing + canaries            | $15                 |
|                                      | **PRE-PROD TOTAL**                   | **~$633–718/month** |

---

### PROD Environment

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
|                                      | **PROD TOTAL**                     | **~$954–1,148/month** |

---

## Cost Summary Table

| Environment        | Low Est.   | High Est.  | Notes                                  |
| ------------------ | ---------- | ---------- | -------------------------------------- |
| **Dev**            | $147       | $177       | Bedrock usage is primary variable      |
| **Staging**        | $230       | $270       | WAF + detailed monitoring adds cost    |
| **Pre-Prod**       | $633       | $718       | Multi-AZ DB + 2 NAT GWs dominant       |
| **Prod**           | $954       | $1,148     | Bedrock inference is largest line item |
| **All Envs Total** | **$1,964** | **$2,313** |                                        |

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

| Env      | Queries/Day | Embed Syncs      | Monthly Bedrock Cost |
| -------- | ----------- | ---------------- | -------------------- |
| Dev      | 500         | Rare             | $25–50               |
| Staging  | 1,000       | Weekly           | $50–90               |
| Pre-Prod | 5,000       | Bi-weekly        | $150–250             |
| Prod     | 10,000+     | On corpus change | $300–500             |

> **Key optimization**: Cache frequent RAG responses. Mahabharata content is static — identical questions from different users waste inference budget. A DynamoDB TTL cache on the `(question_hash, kb_id)` key can cut Bedrock costs by **30–50%**.

---

## Quick Wins Checklist

- [ ] Add VPC Gateway Endpoints for S3 and DynamoDB (free, reduces NAT data charges)
- [ ] Implement RAG response caching in `vyasa-rag-service` with 24h TTL
- [ ] Configure ECS scheduled scaling OFF in dev/staging (nights + weekends)
- [ ] Reduce Bedrock ingestion jobs to fire only on S3 corpus change events (S3 Event → Lambda trigger)
- [ ] Enable AWS Cost Anomaly Detection on `CostCenter: learning` tag filter
- [ ] Set AWS Budgets alert at $1,500/month (all envs combined) + $200/month per lower env

---

## AWS Budget Alarm Already Configured

The `VyasaLambdaStack` includes a CloudWatch alarm at **$8 threshold**
(`vyasa-rag-budget-{env}`) — this only covers Vyasa RAG billing.

**Recommended**: Create an AWS Budgets alert (not CloudWatch) for total account spend
at `$1,500/month` to catch runaway costs across all stacks.

---

_Generated from CDK stack analysis: `environments.ts`, `vyasa-lambda-stack.ts`, `vyasa-ui-stack.ts`, `vyasa-vector-stack.ts`, `ecs-stack.ts`, `database-stack.ts`, `network-stack.ts`, `security-stack.ts`_
