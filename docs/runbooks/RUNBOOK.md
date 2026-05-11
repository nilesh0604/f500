# Runbook Template

This directory contains operational runbooks for common failure scenarios.

## Available Runbooks

| Scenario                       | File                          | Severity | Last Updated |
| ------------------------------ | ----------------------------- | -------- | ------------ |
| Service Unresponsive           | `service-unresponsive.md`     | P1       | 2024-11-XX   |
| Database Connection Exhaustion | `db-connection-exhaustion.md` | P1       | 2024-11-XX   |
| Queue Backlog Growing          | `queue-backlog.md`            | P2       | 2024-11-XX   |
| High Error Rate                | `high-error-rate.md`          | P2       | 2024-11-XX   |
| Memory Leak                    | `memory-leak.md`              | P2       | 2024-11-XX   |
| Failed Deployment Rollback     | `deployment-rollback.md`      | P1       | 2024-11-XX   |
| Data Corruption Recovery       | `data-corruption.md`          | P1       | 2024-11-XX   |

## Runbook Format

Each runbook follows this structure:

```markdown
# [Scenario Name]

## Symptoms

What alerts fire, what metrics look like, what users report.

## Severity

P1/P2/P3/P4 with justification.

## Impact Assessment

- Affected users:
- Affected services:
- Business impact:

## Immediate Actions (< 5 minutes)

1. Acknowledge alert
2. Check service status dashboard
3. [Action 3]

## Investigation Steps

1. Check CloudWatch logs for errors
2. Review X-Ray traces
3. [Step 3]

## Resolution

### Quick Fix

Steps to restore service quickly.

### Root Cause Fix

Steps to address underlying issue.

## Verification

How to confirm the issue is resolved.

## Post-Incident

- Post-mortem required: Yes/No
- Action items:
- Runbook updates needed:

## Escalation

When to escalate and to whom.
```

## Quick Reference: Common Commands

### Check Service Health

```bash
# Health check endpoint
curl -s http://<service>/health | jq .

# Readiness check
curl -s http://<service>/ready | jq .

# ECS service status
aws ecs describe-services \
  --cluster orderflow-prod \
  --services order-service \
  --query 'services[0].{status:status,runningCount:runningCount,desiredCount:desiredCount}'
```

### View Logs

```bash
# Recent errors
aws logs filter-log-events \
  --log-group-name /ecs/order-service \
  --filter-pattern '{ $.level = "error" }' \
  --start-time $(date -d '5 minutes ago' +%s)000

# Specific correlation ID
aws logs filter-log-events \
  --log-group-name /ecs/order-service \
  --filter-pattern '{ $.correlationId = "req-12345" }'
```

### Database Checks

```bash
# Connection count
aws rds describe-db-clusters \
  --db-cluster-identifier orderflow-prod \
  --query 'DBClusters[0].DatabaseConnections'

# Active connections query (from bastion)
psql -h <endpoint> -U admin -c "SELECT count(*) FROM pg_stat_activity;"
```

### Queue Checks

```bash
# SQS queue depth
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-events \
  --attribute-names ApproximateNumberOfMessages

# DLQ messages
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-events-dlq \
  --attribute-names ApproximateNumberOfMessages
```

### ECS Scaling

```bash
# Manual scale up
aws ecs update-service \
  --cluster orderflow-prod \
  --service order-service \
  --desired-count 5

# Check deployment status
aws ecs describe-services \
  --cluster orderflow-prod \
  --services order-service \
  --query 'services[0].deployments'
```

## Escalation Matrix

| Level | Role                | Response Time | Contact          |
| ----- | ------------------- | ------------- | ---------------- |
| L1    | On-Call Engineer    | 5 min         | On-call rotation |
| L2    | Senior Engineer     | 15 min        | Engineering lead |
| L3    | Tech Lead           | 30 min        | Tech lead        |
| L4    | Engineering Manager | 1 hour        | Manager          |

## External Contacts

| Service      | Escalation Path         | SLA    |
| ------------ | ----------------------- | ------ |
| AWS Support  | Premium Support Console | 15 min |
| DNS Provider | Support portal          | 1 hour |

## Useful Links

- [CloudWatch Dashboard](https://console.aws.amazon.com/cloudwatch/home#dashboards:name=orderflow-prod)
- [X-Ray Service Map](https://console.aws.amazon.com/xray/home#/service-map)
- [ECS Console](https://console.aws.amazon.com/ecs/home#/clusters/orderflow-prod/services)
- [SQS Console](https://console.aws.amazon.com/sqs/home)

---

**Last Updated**: 2024-11-XX
