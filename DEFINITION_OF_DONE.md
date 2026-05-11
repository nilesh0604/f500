# Definition of Done (DoD)

This document defines the complete checklist that every Pull Request must satisfy before being merged to `main`.

## Quality Gates

### Testing

- [ ] **Unit tests written** with >=80% code coverage
  - Business logic must have comprehensive unit tests
  - Edge cases and error paths covered
  - Mocked external dependencies
- [ ] **Integration tests** for new endpoints
  - API endpoints tested with supertest
  - Database interactions tested with testcontainers
  - External service mocks where applicable
- [ ] **Contract tests updated** if API contract changes (Pact)
  - Consumer-driven contract tests pass
  - Provider verification tests pass
- [ ] **E2E tests** for critical user journeys (frontend)
  - Login flow
  - Order creation flow
  - Order status update flow

### Code Quality

- [ ] **No SonarQube critical/blocker issues**
  - Code smells reviewed and justified if ignored
  - Duplication < 3%
- [ ] **No high/critical Snyk vulnerabilities**
  - All high/critical issues addressed or have exceptions
  - Dependency updates justified
- [ ] **Dependency license check passed**
  - No GPL or other copyleft licenses in proprietary code
  - License compatibility verified
- [ ] **Linting passes** (ESLint + Stylelint)
  - No errors, warnings reviewed
  - Prettier formatting applied

### Documentation

- [ ] **API docs updated** (OpenAPI spec)
  - New endpoints documented
  - Request/response schemas accurate
  - Examples provided
- [ ] **ADR written** for architectural changes
  - New ADR created if changing established patterns
  - ADR linked in PR description
- [ ] **RFC referenced/closed** if applicable
  - RFC decision documented
  - Implementation matches RFC
- [ ] **Changelog updated** (`CHANGELOG.md`)
  - Entry added under `[Unreleased]`
  - Follows Keep a Changelog format
  - Links to PR/issue where applicable
- [ ] **README updates** if project setup changes
  - New environment variables documented
  - Setup instructions accurate

### Security

- [ ] **No secrets in code** (pre-commit hook + TruffleHog scan)
  - No hardcoded credentials
  - No private keys
  - No API tokens in source
- [ ] **Security review completed** for auth/input-validation changes
  - Authentication flow reviewed
  - Input validation with Zod schemas
  - Authorization checks in place
- [ ] **Threat model updated** if trust boundary or data flow changes
  - New data flows documented
  - New threats identified and mitigated
- [ ] **PII handling verified**
  - PII encrypted at rest
  - PII masked in logs
  - GDPR compliance checked

### Performance & Operations

- [ ] **Performance impact assessed**
  - Database query performance checked (EXPLAIN ANALYZE)
  - N+1 queries eliminated
  - Caching strategy considered
- [ ] **Error handling** with proper HTTP codes
  - 4xx for client errors with clear messages
  - 5xx for server errors without information leakage
  - Error responses consistent with API spec
- [ ] **Structured logging added** with correlation ID propagated
  - Correlation ID passed through all service calls
  - Contextual logging (userId, orderId, etc.)
  - Appropriate log levels (ERROR, WARN, INFO, DEBUG)

### Frontend Specific (if applicable)

- [ ] **Accessibility checked** (axe-core)
  - WCAG 2.1 AA compliance verified
  - Keyboard navigation works
  - Screen reader tested for critical flows
  - Color contrast ratio >= 4.5:1
- [ ] **Bundle size checked**
  - No significant increase without justification
  - Tree-shaking verified
  - Lazy loading implemented for routes
- [ ] **Responsive design** verified
  - Mobile, tablet, desktop layouts tested
  - No horizontal scrolling at any breakpoint

### DevOps & Git

- [ ] **Commits signed** with GPG
  - All commits have verified signatures
  - `git log --show-signature` validates
- [ ] **Branch up to date** with `main`
  - Rebased or merged with latest `main`
  - No merge conflicts
- [ ] **CI/CD passes**
  - All GitHub Actions workflows green
  - No flaky tests

## Review Checklist for Reviewers

As a reviewer, verify:

1. [ ] **Code quality**: Readable, maintainable, follows conventions
2. [ ] **Test quality**: Tests actually verify behavior, not just coverage
3. [ ] **Architecture**: Follows established patterns, ADRs respected
4. [ ] **Security**: No obvious vulnerabilities, input validated
5. [ ] **Performance**: No obvious bottlenecks, queries efficient
6. [ ] **Completeness**: All DoD items addressed or explicitly deferred

## Exceptions

Exceptions to the DoD must be:

1. Documented in the PR description with justification
2. Approved by at least one senior reviewer
3. Tracked as technical debt with a follow-up issue

Examples of acceptable exceptions:

- **Test coverage**: Complex legacy code where testing is infeasible
- **Documentation**: Internal-only changes with no user impact
- **Performance**: Changes with minimal impact requiring load testing

## Post-Merge

After merge to `main`:

1. Monitor error rates for 30 minutes
2. Verify metrics are flowing correctly
3. Check logs for anomalies
4. Update any runbooks if operational procedures changed

---

**Last Updated**: 2024-11-XX
