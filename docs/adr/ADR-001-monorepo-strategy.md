# ADR-001: Monorepo Strategy with Nx

## Status

Accepted

## Context

We need to decide on a repository strategy for the OrderFlow application which consists of:

- 1 Angular frontend application
- 2 Node.js microservices (Order Service, Notification Service)
- 5+ shared libraries (types, schemas, logger, auth, testing-utils)
- AWS CDK infrastructure code

The options considered are:

1. **Polyrepo**: Separate repositories for each service
2. **Monorepo**: Single repository with Nx workspace management

## Decision

We will use a **monorepo strategy with Nx** as our workspace management tool.

## Consequences

### Positive

- **Atomic changes**: Changes across frontend, backend, and infrastructure can be made in a single PR
- **Code sharing**: Shared libraries (types, utilities, testing tools) without version management complexity
- **Dependency management**: Single `package.json`, consistent dependency versions across services
- **Build optimization**: Nx affected commands only build/test what changed
- **Unified tooling**: Single ESLint, Prettier, Jest configuration
- **Cross-service refactoring**: Rename a type across all services in one operation
- **Visibility**: All code is visible for security reviews, architecture decisions

### Negative

- **Repository size**: Grows larger over time (mitigated by shallow clones)
- **Access control**: Cannot restrict service access per team (acceptable for small team)
- **CI complexity**: Must handle affected projects only to keep builds fast
- **Blast radius**: A breaking change in shared library affects all services

### Mitigations

- Use Nx `affected` commands in CI to only test/build changed projects
- Version shared libraries internally with path mapping, not npm versioning
- Maintain strict code ownership via CODEOWNERS
- Enforce PR reviews for shared library changes

## Related Decisions

- ADR-002: Event-Driven Architecture (services share event schemas)
- ADR-005: Service-to-Service Auth (shared auth library)

## Date

2024-11-XX

## Author

OrderFlow Architecture Team
