# Change Management Process

This document defines how changes are classified, reviewed, approved, and deployed in OrderFlow.

## Change Types

| Type          | Description              | Examples                            | Approval Required              |
| ------------- | ------------------------ | ----------------------------------- | ------------------------------ |
| **Standard**  | Pre-authorized, low-risk | Dependency updates, bug fixes       | Automated CI/CD                |
| **Normal**    | Requires review          | New features, configuration changes | PR review + CAB (if high risk) |
| **Emergency** | Urgent fix needed        | Security patch, outage fix          | Post-hoc approval              |

## Change Advisory Board (CAB)

### CAB Composition

- **Chair**: Engineering Manager
- **Permanent members**: Tech Lead, Senior Engineer
- **Rotating members**: One engineer from affected service
- **Optional**: Product Manager (for user-facing changes)

### CAB Cadence

- **Weekly**: 30-minute review of upcoming production changes
- **Emergency**: As needed for urgent changes

### CAB Agenda

1. Review changes pending approval (10 min)
2. Discuss high-risk changes (15 min)
3. Post-mortem review for recent incidents (5 min)

## Normal Change Process

### Step 1: RFC (if required)

Required for:

- New microservices
- Architecture pattern changes
- Breaking API changes
- Database schema changes
- Security model changes

**Not required for**:

- Bug fixes
- Feature additions within existing patterns
- UI changes
- Documentation updates

### Step 2: Implementation

1. Create feature branch from `main`
2. Implement with tests
3. Update documentation
4. Ensure all DoD items complete

### Step 3: Pull Request

PR must include:

- [ ] Clear description of change
- [ ] Link to RFC/ADR if applicable
- [ ] Test results
- [ ] Rollback plan
- [ ] CAB approval (if required)

### Step 4: Review

| Change Scope     | Reviewers Required           |
| ---------------- | ---------------------------- |
| Single service   | 1 engineer (not author)      |
| Cross-service    | 1 from each affected service |
| Shared library   | 2 engineers                  |
| Infrastructure   | Tech Lead                    |
| Security-related | Security reviewer            |

### Step 5: CAB Review (if required)

High-risk changes require CAB approval:

- Database migrations
- Security changes
- Architecture changes
- Changes to SLO-critical paths

CAB approval documented as GitHub PR comment with:

```
CAB Approval: ✅
Date: YYYY-MM-DD
Members present: [names]
Risks discussed: [summary]
Conditions: [any special deployment conditions]
```

### Step 6: Deployment

Follow [CD Pipeline](../PRODUCTION_APP_MASTER_PLAN.md#phase-6-cd-pipeline--deployment-week-67):

1. Deploy to staging
2. Run smoke tests
3. Manual approval for production
4. Canary deploy (10% → 50% → 100%)
5. Monitor for 30 minutes between stages

## Emergency Change Process

For critical fixes needed outside normal process:

### When to Use

- Security vulnerability requiring immediate fix
- Production outage requiring immediate fix
- Data corruption requiring immediate fix

### Process

1. **Page on-call engineer** (if not already engaged)
2. **Create hotfix branch** from production tag
3. **Minimal fix** with tests
4. **Expedited review**: 1 reviewer minimum
5. **Deploy directly** to production (bypass staging)
6. **Post-hoc CAB** within 24 hours

### Documentation Required

```markdown
# Emergency Change Log

Date: YYYY-MM-DD HH:MM
Change: [Brief description]
Reason: [Why emergency process used]
Risks: [Risks accepted]
Reviewer: @name
Deployed by: @name
Post-hoc CAB: Scheduled for [date]
```

## Rollback Criteria

### Automatic Rollback Triggers

| Metric                | Threshold           | Action                 |
| --------------------- | ------------------- | ---------------------- |
| Error rate            | > 1% for 5 minutes  | Auto-rollback          |
| P95 latency           | > 1s for 10 minutes | Alert, manual decision |
| Health check failures | > 50% for 2 minutes | Auto-rollback          |

### Manual Rollback Decision Tree

```
Issue detected
    |
    ├─> Can it be fixed in < 15 min?
    |   ├─> YES → Hotfix forward
    |   └─> NO → Rollback
    |
    └─> Is it security-related?
        ├─> YES → Immediate rollback
        └─> NO → Assess user impact
            ├─> High impact → Rollback
            └─> Low impact → Monitor and fix forward
```

### Rollback Procedure

1. **Identify last known good version**:

```bash
aws ecs describe-services \
  --cluster orderflow-prod \
  --service order-service \
  --query 'services[0].deployments[*].{id:id,status:status,createdAt:createdAt}'
```

2. **Initiate rollback** (CDK):

```bash
cd infra
npx cdk deploy EcsStack --rollback
```

3. **Verify rollback**:

```bash
curl https://api.orderflow.io/health
aws ecs describe-services \
  --cluster orderflow-prod \
  --services order-service
```

4. **Communicate**:

```
🔄 ROLLBACK COMPLETED
Service: order-service
From: v1.2.3 (bad)
To: v1.2.2 (last known good)
Reason: [brief description]
Duration: X minutes
```

## Change Calendar

### Freeze Periods

| Period             | Type           | Description           |
| ------------------ | -------------- | --------------------- |
| Year-end           | No deploys     | Dec 23 - Jan 2        |
| Black Friday       | Freeze         | No changes week of    |
| Error budget < 20% | Emergency only | Until budget recovers |

### Scheduled Maintenance Windows

| Window              | Frequency | Activities                           |
| ------------------- | --------- | ------------------------------------ |
| Saturday 2-6 AM UTC | Monthly   | Database maintenance, major upgrades |

## Change Metrics

### KPIs Tracked

| Metric                 | Target   | Measurement                      |
| ---------------------- | -------- | -------------------------------- |
| Lead time for changes  | < 3 days | PR open to production deploy     |
| Change failure rate    | < 10%    | % of changes causing incidents   |
| Mean time to recovery  | < 1 hour | Incident detection to resolution |
| CAB meeting attendance | > 90%    | Members present                  |

### Monthly Change Report

```
OrderFlow Change Report - Month YYYY-MM

Changes Deployed: 45
├─ Standard: 30
├─ Normal: 12
└─ Emergency: 3

Success Rate: 93% (42/45 successful)
Failed Changes: 3
├─ Rolled back: 2
└─ Fixed forward: 1

Average Lead Time: 2.3 days
CAB Reviews: 5
Emergency Changes: 3

Incidents Caused by Changes: 2
Post-mortems Completed: 2
```

## Tooling

| Tool           | Purpose                                     |
| -------------- | ------------------------------------------- |
| GitHub PRs     | Change documentation and approval           |
| GitHub Issues  | RFC tracking                                |
| PagerDuty      | Emergency change notifications              |
| CloudWatch     | Deployment monitoring and rollback triggers |
| AWS CodeDeploy | Automated rollback capability               |

## Training

### New Engineer Onboarding

- Change management process overview (30 min)
- CAB observation (2 sessions)
- Emergency change drill (simulated)

### Annual Refresher

- All engineers review change policy
- Emergency drill exercise
- CAB process walkthrough

---

**Last Updated**: 2024-11-XX

**Next Review**: 2025-05-XX
