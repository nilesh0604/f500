# CLAUDE.md — infra (AWS CDK)

## Responsibility

All AWS infrastructure as code using AWS CDK (TypeScript).
Manages 8 stacks across 4 environments (dev / staging / pre-prod / prod).
Owner: platform-team

---

## IMPORTANT: Safety Rules

- YOU MUST run `npm run cdk:diff` before any `cdk deploy` — never deploy blindly
- Never modify prod stack without human confirmation
- `cdk destroy` is blocked in `.cloud/permissions.yaml` — requires manual override
- All resources must have the standard tags (see Tagging section below)
- Destruction protection is ON for prod resources — do NOT disable it

---

## CDK Stacks (in dependency order)

| Stack                | File                         | Purpose                                            |
| -------------------- | ---------------------------- | -------------------------------------------------- |
| `NetworkStack`       | `lib/network-stack.ts`       | VPC, subnets, NAT GW, security groups, Flow Logs   |
| `SecurityStack`      | `lib/security-stack.ts`      | Secrets Manager, IAM roles, WAF v2                 |
| `DatabaseStack`      | `lib/database-stack.ts`      | RDS PostgreSQL 16, ElastiCache Redis 7             |
| `EventStack`         | `lib/event-stack.ts`         | EventBridge bus, SQS queues, DLQs                  |
| `ECSStack`           | `lib/ecs-stack.ts`           | Fargate cluster, task defs, ALB, auto-scaling      |
| `CDNStack`           | `lib/cdn-stack.ts`           | CloudFront, S3 (frontend), OAC                     |
| `MonitoringStack`    | `lib/monitoring-stack.ts`    | CloudWatch alarms, dashboards, SNS topics          |
| `ObservabilityStack` | `lib/observability-stack.ts` | SLO alarms, Synthetics canaries, anomaly detection |
| `AppConfigStack`     | `lib/appconfig-stack.ts`     | AWS AppConfig feature flags                        |
| `RollbackStack`      | `lib/rollback-stack.ts`      | Auto-rollback Lambda on error rate spike           |

---

## Environments

Config in `config/environments.ts`. Always reference `EnvironmentConfig` interface.

| Env      | VPC CIDR    | DB           | Multi-AZ | WAF |
| -------- | ----------- | ------------ | -------- | --- |
| dev      | 10.0.0.0/16 | db.t3.micro  | No       | No  |
| staging  | 10.1.0.0/16 | db.t3.small  | No       | Yes |
| pre-prod | 10.2.0.0/16 | db.t3.medium | Yes      | Yes |
| prod     | 10.3.0.0/16 | db.t3.medium | Yes      | Yes |

Specify env with CDK context: `cdk deploy --context env=staging`

---

## Tagging (REQUIRED on all resources)

```typescript
Tags.of(resource).add('Project', 'orderflow');
Tags.of(resource).add('Environment', config.envName);
Tags.of(resource).add('ManagedBy', 'cdk');
Tags.of(resource).add('CostCenter', 'engineering');
Tags.of(resource).add('Team', 'platform');
```

Use `config.tags` object from `EnvironmentConfig` — all common tags are pre-populated.

---

## IAM Rules (Fortune 500 least-privilege)

- Never use `*` in `Resource` or `Action` in any IAM policy
- One IAM role per ECS service (task role)
- Roles allow only the specific actions that service needs
- No cross-service role sharing

---

## CDK Commands

```bash
# From repo root
npm run cdk:diff          # Preview changes (ALWAYS run before deploy)
npm run cdk:deploy        # Deploy (prompts for confirmation)

# From infra/ directory
cdk synth --context env=dev      # Synthesize CloudFormation
cdk diff --context env=staging   # Diff against deployed stack
cdk deploy --context env=staging --require-approval broadening
```

---

## CDK Tests

Tests in `test/` using `@aws-cdk/assertions`:

- 42 assertions across 4 suites (NetworkStack, DatabaseStack, EventStack, SecurityStack)
- Run: `cd infra && npm test`
- Add assertion tests when adding new resources — no exceptions

---

## Known Gaps (tracked in PRODUCTION_APP_MASTER_PLAN.md)

- Secrets rotation Lambda not wired (`SecretRotationSchedule` CDK construct missing)
- Route 53 records not provisioned (no registered domain yet)
- Some config still in ECS `environment` vars — should migrate to SSM Parameter Store
