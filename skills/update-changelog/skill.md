# Skill: Update CHANGELOG.md — Vyasa Intelligence

## When to use

Use this skill before every commit. The changelog must be updated as part of every PR.

---

## Format (Keep a Changelog)

File: `CHANGELOG.md` at repo root.

```markdown
## [Unreleased]

### Added

- Description of new feature or capability

### Changed

- Description of change to existing functionality

### Fixed

- Description of bug fix

### Security

- Description of security fix or improvement

### Deprecated

- Description of feature being deprecated

### Removed

- Description of removed feature
```

---

## Rules

1. Always add to `## [Unreleased]` section — never create a new version section (that is done at release time)
2. Use present tense: "Add cancellation endpoint" not "Added cancellation endpoint"
3. Reference the ticket: append ` (JIRA-456)` at end of each entry
4. Be specific — not "Updated order service" but "Add `cancelOrder` use case to order-service with idempotency check"
5. Group by service if multiple services changed:

   ```markdown
   ### Added

   - `order-service`: Add order cancellation endpoint `PATCH /v1/orders/:id/cancel` (JIRA-456)
   - `web`: Add cancel button to Order Detail screen (JIRA-456)
   ```

---

## Example entry for a typical feature

```markdown
## [Unreleased]

### Added

- `order-service`: Add `cancelOrder` use case — `PATCH /v1/orders/:id/cancel` endpoint with
  idempotency check, audit trail entry, and EventBridge `orderflow.order.cancelled` event (JIRA-456)
- `notification-svc`: Handle `orderflow.order.cancelled` event — emit `order:cancelled`
  via WebSocket to connected clients (JIRA-456)
- `web`: Add cancel button to Order Detail screen; show cancellation reason input modal (JIRA-456)

### Changed

- `libs/shared-types`: Add `cancelled` to `OrderStatus` enum (JIRA-456)
- `libs/event-schemas`: Add `OrderCancelledEvent` schema with Zod validation (JIRA-456)
```

---

## How to find what changed

```bash
git diff main --name-only    # files changed
git diff main --stat         # summary
```

Use this output to write accurate changelog entries — don't guess.
