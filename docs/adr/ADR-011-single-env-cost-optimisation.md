# ADR-011: Single-Environment Cost Optimisation

| Field        | Value                                                     |
| ------------ | --------------------------------------------------------- |
| **Status**   | Accepted                                                  |
| **Date**     | 2026-05-24                                                |
| **Deciders** | Nilesh Shinde                                             |
| **Context**  | OrderFlow + Vyasa Intelligence personal/portfolio project |

---

## Context

After completing UI and backend deployment, a full AWS cost analysis
(`docs/AWS_COST_ANALYSIS.md`) revealed the monthly estimate:

| Scope                  | Low  | High   |
| ---------------------- | ---- | ------ |
| Prod (before this ADR) | $954 | $1,148 |

Three decisions were identified as high-ROI cost reductions that are
appropriate for a **single-owner portfolio/demo application** where:

- There is no separate QA team or regulated release process requiring
  isolated staging environments.
- Availability SLA is best-effort; brief downtime during a deploy is
  acceptable.
- Bedrock inference is the dominant variable cost and the workload is
  low-traffic (personal use, demos, interviews).

---

## Decisions

### Decision 1 — Single environment (remove dev/staging/pre-prod)

**Decision:** Collapse `environments.ts` from a 4-entry map to a single
exported `config` object. Remove all dev, staging, and pre-prod configurations.

**Rationale:**

- Multi-environment infrastructure existed for a team workflow that does not
  apply to a single-owner project.
- Simplifies CI/CD to a single `deploy` job on `main`.
- Reduces cognitive overhead — one config, one set of resources to monitor.

**Trade-offs accepted:**

- No pre-production smoke environment. Regression testing must be done locally
  or via the golden-dataset eval runner before merging to `main`.
- Any infrastructure mistake deploys directly to prod. Mitigated by CDK
  `terminationProtection: true` on stateful stacks and the existing rollback
  Lambda.

**Changes made:**

- `infra/config/environments.ts` — removed `devConfig`, `stagingConfig`, `getConfig()`,
  and `environments` map. Now exports single `export const config` with prod values only.
- `infra/bin/app.ts` — updated import to use `config` directly instead of `getConfig()`.
  Stack prefix is now always `OrderFlow-*` (no environment suffix).
- `.github/workflows/vyasa-rag-cd.yml` — staging + eval + prod jobs collapsed
  to single `deploy` job.
- `.github/workflows/vyasa-ui-cd.yml` — stack name references updated.

---

### Decision 2 — Downsize RDS to `db.t3.small`, disable Multi-AZ

**Before:** `db.t3.medium`, Multi-AZ, 100 GB allocated  
**After:** `db.t3.small`, Single-AZ, 50 GB allocated, `dbMaxAllocatedStorage: 200`

**Rationale:**

- OrderFlow is a portfolio demo; actual DB load is near zero (no real
  production traffic).
- `db.t3.medium` Multi-AZ costs ~$190/month. `db.t3.small` Single-AZ costs
  ~$30/month — a **~$160/month saving**.
- `dbDeletionProtection` kept `true` to prevent accidental drops.
- If this ever moves to real production traffic, upgrading instance class and
  re-enabling Multi-AZ is a one-line CDK change + `cdk deploy`.

**Trade-offs accepted:**

- No automatic standby failover. RDS outage during an AZ failure would require
  manual recovery (~5–30 min RTO).
- `db.t3.small` has 2 GB RAM vs 4 GB on `medium`; adequate for demo workloads.

---

### Decision 3 — Downsize ECS to `desiredCount: 1`, scale floor to 1

**Before:** Both services — `desiredCount: 2`, `minCapacity: 2`  
**After:** Both services — `desiredCount: 1`, `minCapacity: 1`

**Rationale:**

- Running 2 tasks per service for a zero-traffic portfolio app wastes ~$65/mo
  per service (2 × 1024 vCPU / 2048 MB Fargate tasks).
- Auto-scaling max stays at 10, so the service scales out under real load.
- A single task per service still handles request spikes via the ALB and
  auto-scaling policy.

**Trade-offs accepted:**

- During a task replacement (deploy or AZ failure), there is a brief window
  with zero running tasks. For a demo/portfolio context this is acceptable.
- If Fargate task start time (~30s) is too slow under sudden traffic, the
  `minCapacity` can be raised back to 2.

---

## Revised Monthly Estimate (post-ADR)

| Service                  | Before         | After        | Saving       |
| ------------------------ | -------------- | ------------ | ------------ |
| RDS PostgreSQL           | ~$190          | ~$30         | **~$160**    |
| ElastiCache Redis        | ~$50           | ~$50         | —            |
| ECS Fargate (2 services) | ~$130          | ~$65         | **~$65**     |
| NAT Gateway              | ~$70 (was 2)   | ~$35 (1)     | **~$35**     |
| CloudFront PriceClass    | ~$15           | ~$10         | **~$5**      |
| Everything else          | ~$499–703      | ~$499–703    | —            |
| **Total**                | **$954–1,148** | **$689–898** | **~$265/mo** |

Bedrock inference ($300–500/month) remains the dominant cost and is addressed
separately via response caching (see `docs/AWS_COST_ANALYSIS.md`).

---

## Consequences

- Stack names use `OrderFlow-*` prefix (no environment suffix).
- `dbDeletionProtection: true` and `terminationProtection: true` are retained
  on all stateful stacks (RDS, Redis, ECS, Network) to prevent accidental data
  loss.
- The `db.t3.small` + Single-AZ change will trigger an RDS modification
  (instance class change + Multi-AZ disable) which may cause 1–5 min of DB
  downtime on next `cdk deploy`.
