## Description

Brief description of the changes introduced by this PR.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Performance improvement
- [ ] Security fix

## Related Issues

Fixes #(issue number)
Relates to #(issue number)

## Related RFC/ADR

- RFC: docs/rfc/...
- ADR: docs/adr/...

## Definition of Done Checklist

- [ ] Unit tests written (>=80% coverage)
- [ ] Integration tests for new endpoints
- [ ] Contract test updated if API contract changes (Pact)
- [ ] No SonarQube critical/blocker issues
- [ ] No high/critical Snyk vulnerabilities introduced
- [ ] Dependency license check passed
- [ ] API docs updated (OpenAPI spec)
- [ ] ADR written for architectural changes
- [ ] RFC referenced/closed if applicable
- [ ] Changelog updated (`CHANGELOG.md`)
- [ ] No secrets in code (pre-commit hook + TruffleHog scan)
- [ ] Security review completed for auth/input-validation changes
- [ ] Threat model updated if trust boundary or data flow changes
- [ ] Performance impact assessed
- [ ] Accessibility checked (frontend - axe-core)
- [ ] Error handling with proper HTTP codes
- [ ] Structured logging added (correlation ID propagated)
- [ ] Commit signed (GPG)

## Testing

- [ ] Tested locally
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing (if applicable)

## Screenshots (if applicable)

## Deployment Notes

Any special deployment considerations, database migrations, or feature flags?

## Rollback Plan

Steps to rollback this change if needed:

1.

## Security Considerations

- [ ] No PII exposed in logs
- [ ] Input validation implemented
- [ ] Authentication/Authorization checked
- [ ] Dependencies scanned for vulnerabilities
