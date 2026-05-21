# Skill: Open Pull Request — OrderFlow

## When to use

Use this skill (via deploy-agent) to open a PR after code is committed and pushed.

---

## PR Title format

```
{TICKET_ID}: {imperative description of the change}
```

Examples:

- `JIRA-456: Add order cancellation endpoint`
- `JIRA-789: Fix race condition in idempotency key check`
- `JIRA-101: Upgrade Prisma to 5.x`

---

## PR Body — fill in the template from `.github/PULL_REQUEST_TEMPLATE.md`

Key sections to complete accurately:

### Summary

2-3 sentences: what changed, why, and which services are affected.

### Changes

Bullet list of specific changes per file/service. Use the `git diff main --stat` output.

### Testing

```
- [ ] Unit tests added: X new tests in [file]
- [ ] Coverage: X% (threshold: 80%)
- [ ] Integration tests: [pass/not applicable]
- [ ] Tested locally with `docker compose up`
```

### Security

If new endpoints were added:

```
- New endpoint authenticated: Yes (auth middleware in middleware chain)
- Input validated: Yes (Zod schema in validation/)
- Rate limiting: Yes (perUserRateLimit applied)
```

If no new endpoints: `No new endpoints added`

### Links

```
Ticket: {TICKET_ID}
TDD: docs/features/{TICKET_ID}/TDD.md
```

---

## Using GitHub MCP

```
github.createPullRequest({
  owner: "nilesh0604",
  repo: "f500",
  title: "{TICKET_ID}: {description}",
  head: "{BRANCH}",
  base: "main",
  body: "{filled PR template}",
  draft: false
})
```

---

## Labels to apply (if MCP supports)

Always add:

- `ai-generated` — indicates this PR was opened by an agent

Based on ticket type:

- `feature` | `bug` | `chore` | `security` | `infra`

Based on affected service:

- `order-service` | `notification-svc` | `web` | `infra`

---

## After PR is opened

Output the PR URL and number so the Orchestrator can include it in the final summary.
