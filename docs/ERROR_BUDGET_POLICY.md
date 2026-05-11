# Error Budget Policy

This document defines how we balance reliability with feature velocity using error budgets.

## SLOs and Error Budgets

### Service Level Objectives (SLOs)

| SLO          | Target  | Error Budget (per 30 days) |
| ------------ | ------- | -------------------------- |
| Availability | 99.9%   | 43.8 minutes downtime      |
| Latency p95  | < 200ms | 5% of requests may exceed  |
| Error Rate   | < 0.1%  | 0.1% of requests may error |

### Error Budget Calculation

```
Error Budget = 100% - SLO Target

For 99.9% availability:
- Allowed downtime per month: 43.8 minutes
- Allowed downtime per quarter: 2.19 hours
- Allowed downtime per year: 8.76 hours
```

## Error Budget Policy

| Budget Remaining   | Policy Action     | Engineering Focus                                      |
| ------------------ | ----------------- | ------------------------------------------------------ |
| **> 50%**          | Normal operations | Feature work prioritized                               |
| **20% - 50%**      | Increased rigor   | Reliability work prioritized, load tests mandatory     |
| **< 20%**          | Feature freeze    | All hands on reliability, block non-critical deploys   |
| **0% (exhausted)** | Emergency mode    | All deploys require VP approval, post-mortem mandatory |

## Budget Consumption Tracking

### Dashboard

CloudWatch dashboard showing:

- Current month error budget (downtime minutes)
- Burn rate (downtime per day)
- Projected exhaustion date
- Historical budget consumption

### Alerting

| Alert            | Condition              | Channel                   | Action                  |
| ---------------- | ---------------------- | ------------------------- | ----------------------- |
| Slow burn        | > 2% budget in 1 hour  | Slack                     | Review recent changes   |
| Fast burn        | > 5% budget in 6 hours | PagerDuty + Slack         | Immediate investigation |
| Budget < 20%     | Monthly budget < 20%   | Slack + Email             | Feature freeze warning  |
| Budget exhausted | Monthly budget = 0%    | PagerDuty + Phone + Email | Emergency protocols     |

## Budget Burn Rate Analysis

### Acceptable Burn Rates

| Burn Rate   | Exhaustion Time | Assessment              |
| ----------- | --------------- | ----------------------- |
| 1x (steady) | 30 days         | Sustainable             |
| 2x          | 15 days         | Watch closely           |
| 6x          | 5 days          | Investigate immediately |
| 10x         | 3 days          | Emergency response      |

### Example Calculation

```
Scenario: Service was down for 10 minutes on day 5 of month

Budget remaining: 43.8 - 10 = 33.8 minutes
Days remaining: 25
Burn rate: 10 min / 5 days = 2 min/day
Days to exhaust: 33.8 / 2 = ~17 days
Assessment: Sustainable, but monitor closely
```

## Policy Enforcement

### Feature Freeze Procedures

When error budget < 20%:

1. **Slack announcement** to engineering channel
2. **GitHub branch protection**: Block merges to `main` (except hotfixes)
3. **Daily standup**: Review reliability work in progress
4. **Weekly review**: Error budget status until > 20%

**Exceptions** (require VP Engineering approval):

- Security patches
- Critical bug fixes
- Features with direct revenue impact

### Post-Budget Exhaustion

If budget is exhausted:

1. **Immediate**: All feature work stops
2. **Within 24h**: Post-mortem for budget exhaustion
3. **Within 1 week**: Action items completed to prevent recurrence
4. **Next month**: Start fresh with full budget

## Reliability Work Priorities

When in feature freeze (< 20% budget), prioritize:

1. **P0**: Fix known reliability issues causing budget burn
2. **P1**: Improve observability (better alerts, faster detection)
3. **P2**: Implement circuit breakers and graceful degradation
4. **P3**: Chaos engineering tests to find weaknesses

## Reporting

### Weekly Error Budget Report

Distributed to: Engineering team, Engineering Manager

```
OrderFlow Error Budget Report - Week of YYYY-MM-DD

Availability Budget: 43.8 min/month
Consumed: 12.5 min (28%)
Remaining: 31.3 min (72%)
Status: ✅ Healthy

Incidents This Week:
- [Date]: [Duration] - [Brief description]

Burn Rate Trend:
- Last 7 days: 1.8 min/day (1.2x)
- Projected: Budget exhausts in ~17 days

Action Items:
- [Item 1]
- [Item 2]
```

### Monthly Reliability Review

Meeting agenda (1 hour):

1. SLO performance vs targets (15 min)
2. Error budget consumption analysis (15 min)
3. Incident review (15 min)
4. Reliability improvements planned (15 min)

Attendees: Engineering team, Engineering Manager, Product Manager

## SLO Review Schedule

| Review              | Frequency | Decision                                   |
| ------------------- | --------- | ------------------------------------------ |
| SLO targets         | Quarterly | Adjust if consistently missed or exceeded  |
| Error budget policy | Annually  | Calibrate based on business needs          |
| Alert thresholds    | Monthly   | Tune to reduce noise while catching issues |

## Exceptions and Overrides

In exceptional circumstances, the Engineering Manager may grant temporary exceptions:

- **Planned maintenance**: Does not count against budget (advance notice given)
- **Third-party outages**: AWS, dependency failures (tracked separately)
- **Beta features**: May have different SLOs (clearly marked)

## Related Documents

- [INCIDENT_RESPONSE_PLAN.md](INCIDENT_RESPONSE_PLAN.md)
- [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md) - Performance testing requirements
- [DISASTER_RECOVERY_PLAN.md](DISASTER_RECOVERY_PLAN.md)

---

**Last Updated**: 2024-11-XX

**Next Review**: 2025-02-XX
