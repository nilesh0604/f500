# Capacity Plan

> **Phase 8.4 — Fortune 500 Standard**: Production systems must have documented capacity baselines and growth projections.

---

## Service Baselines

### Order Service

| Metric                   | Dev     | Staging | Pre-Prod | Prod    |
| ------------------------ | ------- | ------- | -------- | ------- |
| vCPU (Fargate units)     | 0.25    | 0.5     | 1.0      | 1.0     |
| Memory (MiB)             | 512     | 1024    | 2048     | 2048    |
| Min tasks                | 1       | 1       | 2        | 2       |
| Max tasks                | 2       | 4       | 8        | 10      |
| DB connections / task    | 20      | 20      | 20       | 20      |
| Redis connections / task | 50      | 50      | 50       | 50      |
| **Max RPS (sustained)**  | ~50     | ~200    | ~500     | ~1 000  |
| **Memory ceiling**       | 450 MiB | 900 MiB | 1.8 GiB  | 1.8 GiB |

### Notification Service

| Metric                    | Dev    | Staging | Pre-Prod | Prod   |
| ------------------------- | ------ | ------- | -------- | ------ |
| vCPU (Fargate units)      | 0.25   | 0.5     | 1.0      | 1.0    |
| Memory (MiB)              | 512    | 1024    | 2048     | 2048   |
| Min tasks                 | 1      | 1       | 2        | 2      |
| Max tasks                 | 2      | 4       | 8        | 10     |
| SQS long-poll concurrency | 10 msg | 10 msg  | 10 msg   | 10 msg |
| WebSocket connections     | ~200   | ~500    | ~2 000   | ~5 000 |

---

## Database (PostgreSQL RDS)

| Metric                       | Value                                      |
| ---------------------------- | ------------------------------------------ |
| Max connections per task     | 20 (Prisma `connection_limit`)             |
| PostgreSQL `max_connections` | 100 (db.t3.micro) / 200 (db.t3.medium)     |
| Connection ceiling formula   | `max_connections × 0.8 / 20` = max tasks   |
| Slow query threshold         | 1 000 ms (`log_min_duration_statement`)    |
| Storage growth projection    | ~200 MB / month at 500 RPS (90-day orders) |
| Backup retention             | 7 days (prod), 1 day (other)               |

---

## Redis (ElastiCache)

| Metric                      | Value                        |
| --------------------------- | ---------------------------- |
| Max connections / task      | 50                           |
| Cache TTL (order lists)     | 30 s                         |
| Eviction policy             | `allkeys-lru`                |
| Memory footprint (estimate) | ~50 MB at 10k cached entries |

---

## SQS Queue Thresholds

| Queue                  | Alert at depth | DLQ alert at |
| ---------------------- | -------------- | ------------ |
| `order-created-queue`  | 1 000 msgs     | 1 msg        |
| `order-status-changed` | 1 000 msgs     | 1 msg        |
| Dead-letter queues     | —              | 1 msg        |

---

## Auto-Scaling Policies

| Service          | Trigger       | Scale-Out | Scale-In | Scheduled Out | Scheduled In |
| ---------------- | ------------- | --------- | -------- | ------------- | ------------ |
| order-service    | CPU > 60 %    | +1 task   | −1 task  | 08:00 UTC     | 22:00 UTC    |
| order-service    | Memory > 70 % | +1 task   | −1 task  | —             | —            |
| notification-svc | CPU > 60 %    | +1 task   | −1 task  | 08:00 UTC     | 22:00 UTC    |
| notification-svc | Memory > 70 % | +1 task   | −1 task  | —             | —            |

Scheduled scale-out pre-warms to 50 % of `maxCapacity` to absorb morning traffic ramp.

---

## Storage Growth Projections

| Asset               | Size / Record | Monthly Volume | Monthly Growth |
| ------------------- | ------------- | -------------- | -------------- |
| Order record (PG)   | ~500 B        | 1 M orders     | ~500 MB        |
| Audit log (PG)      | ~300 B        | 2 M entries    | ~600 MB        |
| S3 analytics export | ~1 KB / order | 1 M orders     | ~1 GB          |
| CloudWatch logs     | ~200 B / req  | 50 M requests  | ~10 GB         |

---

## Cost-Per-Request (FinOps)

| Service                 | Unit Cost      | Basis                           |
| ----------------------- | -------------- | ------------------------------- |
| ECS Fargate (order svc) | ~$0.000 04     | 1 vCPU / 2 GiB @ $0.04/vCPU-hr  |
| RDS PostgreSQL          | ~$0.000 01     | db.t3.medium shared across RPMs |
| ElastiCache Redis       | ~$0.000 005    | cache.t3.small                  |
| EventBridge             | ~$0.000 001    | $1 / M events                   |
| SQS                     | ~$0.000 0004   | $0.40 / M messages              |
| CloudFront              | ~$0.000 0085   | $0.0085 / 10k requests          |
| **Total (estimate)**    | **~$0.000 07** | per API request at 500 RPS      |

---

## RDS Read Replicas

> **Note**: RDS read replicas are **documented but not deployed** for this learning project.
>
> For production traffic where reads exceed writes by > 5:1, add a read replica targeting the `listOrders` query path. The Prisma client would require a `readReplica` extension or a separate `prismaRead` instance pointing to the replica endpoint.

---

## Revision History

| Date       | Author        | Change                            |
| ---------- | ------------- | --------------------------------- |
| 2026-05-12 | Platform Team | Initial capacity plan for Phase 8 |
