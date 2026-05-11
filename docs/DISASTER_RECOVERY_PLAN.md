# Disaster Recovery Plan

This document outlines procedures for recovering from major disasters affecting OrderFlow.

## Recovery Objectives

| Metric                             | Target       | Measurement                  |
| ---------------------------------- | ------------ | ---------------------------- |
| **RPO (Recovery Point Objective)** | 1 hour       | Maximum data loss acceptable |
| **RTO (Recovery Time Objective)**  | 30 minutes   | Time to restore service      |
| **RLO (Recovery Level Objective)** | Full service | All features operational     |

## Disaster Scenarios

| Scenario                     | Likelihood | Impact   | RTO                            |
| ---------------------------- | ---------- | -------- | ------------------------------ |
| Single AZ failure            | Medium     | Medium   | 15 min (auto-failover)         |
| Regional AWS outage          | Low        | High     | 30 min (manual failover)       |
| Database corruption          | Low        | Critical | 1 hour (point-in-time restore) |
| Complete infrastructure loss | Very Low   | Critical | 2 hours (full rebuild)         |

## Backup Strategy

### Database (RDS PostgreSQL)

| Type                   | Frequency      | Retention  | Storage          |
| ---------------------- | -------------- | ---------- | ---------------- |
| Automated snapshots    | Daily          | 35 days    | AWS managed      |
| Manual snapshots       | Pre-deployment | Indefinite | S3               |
| Point-in-time recovery | Continuous     | 35 days    | Transaction logs |

**Backup verification**: Monthly restore test to ephemeral instance

### Infrastructure (CDK)

| Component            | Backup Method       | Recovery                   |
| -------------------- | ------------------- | -------------------------- |
| CDK code             | Git repository      | `git clone` + `cdk deploy` |
| ECS task definitions | Versioned in CDK    | Redeploy from main         |
| Secrets              | AWS Secrets Manager | Automatic replication      |
| S3 (frontend assets) | Versioning enabled  | Restore from versions      |

### Configuration

| Component             | Backup          | Recovery              |
| --------------------- | --------------- | --------------------- |
| Environment variables | Parameter Store | Automatic with CDK    |
| Feature flags         | AWS AppConfig   | Automatic replication |
| WAF rules             | CDK code        | Redeploy              |

## Recovery Procedures

### Scenario 1: Single AZ Failure (Auto-Recovery)

**Detection**: CloudWatch alarm, RDS multi-AZ failover

**Automated Actions**:

1. RDS automatically fails over to standby (60-120 seconds)
2. ECS tasks reschedule to healthy AZs
3. ALB health checks route to healthy targets

**Manual Verification**:

```bash
# Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier orderflow-prod \
  --query 'DBInstances[0].DBInstanceStatus'

# Check ECS service
aws ecs describe-services \
  --cluster orderflow-prod \
  --services order-service \
  --query 'services[0].{running:runningCount,desired:desiredCount}'

# Verify application health
curl -s https://api.orderflow.io/health | jq .
```

**Timeline**: 2-5 minutes for full recovery

### Scenario 2: Regional Outage (Manual Failover)

**Trigger**: Complete regional AWS service disruption

**Pre-requisites** (must be set up before disaster):

- Secondary region infrastructure (CDK stacks deployed)
- Database cross-region read replica
- Route 53 health checks

**Failover Steps**:

1. **Promote read replica to primary** (secondary region):

```bash
aws rds promote-read-replica \
  --db-instance-identifier orderflow-dr \
  --region us-west-2
```

2. **Update ECS service scale** (secondary region):

```bash
aws ecs update-service \
  --cluster orderflow-dr \
  --service order-service \
  --desired-count 3 \
  --region us-west-2
```

3. **Update Route 53 failover**:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch file://failover-to-dr.json
```

**Timeline**: 20-30 minutes

### Scenario 3: Database Corruption (Point-in-Time Recovery)

**Detection**: Data integrity checks, application errors

**Recovery Steps**:

1. **Identify last known good time**:

```bash
# Check transaction logs
aws rds describe-db-log-files \
  --db-instance-identifier orderflow-prod
```

2. **Create point-in-time restore**:

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier orderflow-prod \
  --target-db-instance-identifier orderflow-prod-recovery \
  --restore-time 2024-11-15T10:00:00Z \
  --use-latest-restorable-time
```

3. **Verify data integrity**:

```bash
# Connect to recovered instance
psql -h orderflow-prod-recovery... -c "SELECT COUNT(*) FROM orders;"
```

4. **Switch application to recovered database**:

```bash
# Update Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id orderflow/db-credentials \
  --secret-string file://new-credentials.json

# Restart ECS tasks to pick up new credentials
aws ecs update-service \
  --cluster orderflow-prod \
  --service order-service \
  --force-new-deployment
```

**Timeline**: 1-2 hours

### Scenario 4: Complete Infrastructure Loss (Full Rebuild)

**Trigger**: Catastrophic failure requiring complete rebuild

**Recovery Steps**:

1. **Verify Git repository access**:

```bash
git clone https://github.com/nilesh0604/orderflow.git
cd orderflow
```

2. **Bootstrap CDK** (if needed):

```bash
cd infra
npm ci
npx cdk bootstrap aws://123456789/us-east-1
```

3. **Deploy all stacks**:

```bash
npx cdk deploy --all --require-approval never
```

4. **Restore database from snapshot**:

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier orderflow-prod \
  --db-snapshot-identifier manual-snapshot-20241115 \
  --db-instance-class db.t3.micro
```

5. **Verify deployment**:

```bash
# Run smoke tests
npm run test:smoke

# Check health endpoints
curl https://api.orderflow.io/health
curl https://app.orderflow.io/health
```

**Timeline**: 2-3 hours

## Data Integrity Verification

### Post-Recovery Checks

| Check           | Command                                                   | Expected Result        |
| --------------- | --------------------------------------------------------- | ---------------------- |
| Row counts      | `SELECT count(*) FROM orders;`                            | Match pre-disaster     |
| Recent data     | `SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;` | Last 10 orders present |
| User counts     | `SELECT count(*) FROM users;`                             | Match pre-disaster     |
| Index integrity | `REINDEX TABLE orders;`                                   | No errors              |

### Application Verification

```bash
# End-to-end smoke test
curl -X POST https://api.orderflow.io/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Verify login
curl -X POST https://api.orderflow.io/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Create test order
curl -X POST https://api.orderflow.io/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"items":[{"name":"Test Item","quantity":1}]}'
```

## DR Testing Schedule

| Test                   | Frequency   | Scope                          |
| ---------------------- | ----------- | ------------------------------ |
| Snapshot restore       | Monthly     | Restore to test instance       |
| Cross-region failover  | Quarterly   | Full failover and verification |
| Infrastructure rebuild | Bi-annually | Full CDK redeploy              |
| Documentation review   | Quarterly   | Update runbooks                |

## Escalation

| Time from disaster | Action                                 |
| ------------------ | -------------------------------------- |
| 0 min              | Auto-failover attempts (if configured) |
| 5 min              | Page on-call engineer                  |
| 15 min             | Engage senior engineer                 |
| 30 min             | Declare disaster, engage DR team       |
| 1 hour             | Executive notification if RTO exceeded |

## Communication During DR

### Internal Updates (Every 15 minutes)

```
🔄 DR UPDATE: [Time]
Scenario: [Description]
Status: [Assessment/Recovery/Verification]
RTO: [Minutes remaining/target]
Action: [Current recovery step]
Next: [Next step]
```

### External Updates (P1 disasters only)

```
Subject: [DR] OrderFlow Recovery in Progress

We are executing our disaster recovery plan due to [scenario].

Estimated restoration: [Time] (RTO: [X] minutes)
Current status: [Step description]

Updates: [Link to status page]
```

---

**Last Updated**: 2024-11-XX

**Next DR Drill**: 2025-02-XX
