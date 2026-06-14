# Contributing to OrderFlow

Thank you for your interest in contributing to OrderFlow! This document provides guidelines and standards for contributing to this project.

## Table of Contents

- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Code Review Guidelines](#code-review-guidelines)
- [Definition of Done](#definition-of-done)
- [Development Environment Setup](#development-environment-setup)

## Development Workflow

We follow **Trunk-Based Development** with short-lived feature branches:

1. Pull latest from `main`
2. Create feature branch from `main`
3. Make changes with atomic commits
4. Push branch and create PR
5. Code review and CI checks
6. Squash merge to `main`
7. Delete feature branch

## Branching Strategy

### Branch Naming Convention

```
feature/<ticket-id>-<short-description>
hotfix/<ticket-id>-<short-description>
release/v<major>.<minor>.<patch>
docs/<short-description>
refactor/<short-description>
```

Examples:

- `feature/SCRUM-123-user-authentication`
- `hotfix/OF-456-fix-memory-leak`
- `release/v1.2.0`

### Protected Branches

- `main`: Requires PR, 1 approval, all status checks passing
- `release/*`: Requires PR, 2 approvals, manual QA sign-off

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, tooling
- `ci`: CI/CD changes
- `security`: Security-related changes

### Examples

```
feat(auth): add JWT token refresh endpoint

feat(order-service): implement idempotency keys for POST endpoints

fix(notification-svc): resolve WebSocket connection leak

docs(api): update OpenAPI spec for v1.1

refactor(shared-types): extract common interfaces

perf(db): add index on orders.created_at

test(order-service): add contract tests with notification-svc

chore(deps): upgrade prisma to 5.22.0

ci(github): add security scanning workflow

security(auth): implement bcrypt with cost factor 12
```

### Commit Signing

All commits **must be signed** with GPG. Configure with:

```bash
git config --global user.signingkey <KEY_ID>
git config --global commit.gpgsign true
```

## Pull Request Process

### Before Creating PR

1. **Branch is up to date** with `main`
2. **All tests passing** locally
3. **Linting passes** (`npm run lint`)
4. **Formatted correctly** (`npm run format:write`)
5. **No secrets** in code (TruffleHog scan passes)
6. **Commit messages** follow convention
7. **Commits are signed** with GPG

### PR Title Format

```
<type>[optional scope]: <description> [<ticket-id>]
```

Examples:

- `feat(auth): implement JWT authentication [SCRUM-123]`
- `fix(order-service): resolve race condition in status update [OF-456]`

### PR Description Template

Use the PR template and ensure all checklist items are addressed.

### PR Size Guidelines

- **Small**: < 200 lines (preferred)
- **Medium**: 200-400 lines
- **Large**: 400+ lines (requires additional review time)

## Code Review Guidelines

### As an Author

- Keep PRs focused and small
- Provide context in PR description
- Respond to feedback within 24 hours
- Resolve conversations after addressing

### As a Reviewer

- Review within 24 hours of PR submission
- Use constructive, specific feedback
- Approve only if you understand the changes
- Check:
  - [ ] Code quality and readability
  - [ ] Test coverage and quality
  - [ ] Security implications
  - [ ] Performance considerations
  - [ ] Documentation updates
  - [ ] Adherence to architecture patterns

### Review Response Times

- **Initial review**: 24 hours
- **Follow-up reviews**: 4 hours
- **Urgent fixes**: 1 hour

## Definition of Done

See [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) for complete checklist.

Every PR must satisfy:

- Unit tests (>=80% coverage)
- Integration tests for new endpoints
- No critical/blocker SonarQube issues
- No high/critical vulnerabilities
- API docs updated (OpenAPI)
- Changelog updated
- Security review (if applicable)
- Performance impact assessed
- Accessibility checked (frontend)
- Signed commits

## Development Environment Setup

### Prerequisites

- Node.js 22.x (see `.nvmrc`)
- npm 10.x
- Docker & Docker Compose
- AWS CLI (for CDK deployments)

### Quick Start

```bash
# Clone repository
git clone <repo-url>
cd orderflow

# Use correct Node version
nvm use

# Install dependencies
npm install

# Start local development stack
docker-compose up -d

# Run tests
npm test

# Start specific service
nx serve order-service
nx serve notification-svc
nx serve web
```

### Pre-commit Hooks

Husky and lint-staged are configured to run on commit:

- Prettier formatting
- ESLint with auto-fix
- Secret scanning (TruffleHog)

### Nx Commands

```bash
# Build affected projects
nx affected --target=build

# Test affected projects
nx affected --target=test

# Lint affected projects
nx affected --target=lint

# Run all tests with coverage
nx run-many --target=test --all --configuration=ci

# Graph dependency graph
nx graph
```

## Architecture Decision Records (ADRs)

For significant architectural decisions, write an ADR following the template in `docs/adr/ADR-XXX-template.md`.

Process:

1. Create draft ADR in a feature branch
2. Link in PR description
3. Review as part of PR
4. Mark as "Accepted" on merge

## Request for Comments (RFCs)

For cross-cutting concerns or significant changes:

1. Create RFC issue using the template
2. Discuss and gather feedback (minimum 3 days)
3. Update RFC with decision
4. Reference RFC in implementation PR

## Getting Help

- **Technical questions**: Create a discussion in GitHub
- **Bug reports**: Use the bug report template
- **Feature requests**: Use the feature request template
- **Security issues**: See [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the project's license.

---

**Happy Contributing!**
