# ADR-008: Containerization Strategy

## Status

**Accepted**

## Context

The OrderFlow application consists of multiple microservices (Order Service, Notification Service) that need to be deployed consistently across development, staging, and production environments. We need a containerization strategy that:

1. Ensures environment parity between local development and production
2. Minimizes image sizes for faster deployments and reduced storage costs
3. Follows security best practices (non-root users, minimal attack surface)
4. Enables hot-reload for efficient local development
5. Supports local AWS service emulation for development and testing

## Decision

### 1. Base Image: node:22-alpine

We will use `node:22-alpine` as the base image for all services because:

- Alpine Linux provides a minimal footprint (~5MB base vs ~180MB for Debian)
- Node 22 is the current LTS version matching our `.nvmrc` specification
- Pre-built images reduce build time and ensure consistency

### 2. Multi-Stage Build Process

Each service Dockerfile will use a 3-stage build:

1. **Builder Stage**: Install dependencies, compile TypeScript, generate Prisma client
2. **Pruning Stage**: Remove dev dependencies, optimize node_modules
3. **Runtime Stage**: Minimal image with only production artifacts

This approach achieves:

- **Smaller final images** (< 150MB target vs ~500MB+ for single-stage builds)
- **No build tools in production** (gcc, python, make only in builder)
- **Layer caching optimization** (package.json changes invalidate fewer layers)

### 3. Security Hardening

- **Non-root user**: All containers run as `appuser` (UID 1001) with minimal privileges
- **Read-only filesystem**: No unnecessary write permissions
- **Health checks**: HTTP health endpoints monitored by Docker and orchestrators
- **Minimal attack surface**: Alpine base excludes many utilities that could be exploited

### 4. Docker Compose Strategy

Two compose configurations:

| File                     | Purpose                    | Use Case                              |
| ------------------------ | -------------------------- | ------------------------------------- |
| `docker-compose.yml`     | Production-like containers | Integration testing, CI/CD validation |
| `docker-compose.dev.yml` | Hot-reload development     | Active feature development            |

### 5. Local AWS Emulation

LocalStack provides local AWS service emulation:

- SQS queues for async messaging
- EventBridge for event routing
- Secrets Manager for credential storage

Benefits:

- No AWS costs during development
- Offline development capability
- Fast feedback loop for AWS integrations
- Deterministic test environments

## Alternatives Considered

### Option A: Single-Stage Dockerfile

**Rejected**: Results in 400MB+ images with unnecessary build tools and dev dependencies in production.

### Option B: Distroless Base Image

**Considered**: Google's distroless images provide excellent security but:

- Lack shell access complicates debugging
- No package manager for emergency troubleshooting
- Harder to implement health checks with wget/curl

### Option C: Docker-in-Docker for Nx

**Rejected**: Running Nx inside Docker with volume mounts for the monorepo is complex and slower than building from host context.

### Option D: Separate Base Image

**Considered**: Creating a custom base image with common dependencies. Rejected because:

- Adds operational complexity (maintaining base image registry)
- Minimal benefit for a 2-service project
- Couples services to shared base image updates

## Consequences

### Positive

- **Fast deployments**: Small images (< 150MB) push and pull quickly
- **Lower costs**: Reduced ECR storage and data transfer
- **Security**: Minimal attack surface, non-root execution
- **Developer productivity**: Hot-reload and LocalStack enable efficient local development
- **Environment parity**: Same Docker images run locally and in ECS Fargate

### Negative

- **Build complexity**: Multi-stage builds are harder to debug when they fail
- **Alpine compatibility**: Some npm packages with native bindings may need `glibc` compatibility
- **LocalStack limitations**: Not all AWS features are supported; some edge cases require real AWS

## Implementation

### Build Commands

```bash
# Build all services
docker-compose -f docker-compose.yml build

# Production-like environment
docker-compose -f docker-compose.yml up -d

# Development with hot-reload
docker-compose -f docker-compose.dev.yml up -d
```

### Image Verification

```bash
# Check image size
docker images | grep orderflow

# Verify non-root execution
docker exec orderflow-order-service id

# Test health check
docker inspect --format='{{.State.Health.Status}}' orderflow-order-service
```

## References

- [Dockerfile Best Practices - Docker Docs](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-stage builds - Docker Docs](https://docs.docker.com/build/building/multi-stage/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [OWASP Container Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [LocalStack Documentation](https://docs.localstack.cloud/)

## Related ADRs

- ADR-001: Monorepo Strategy (Nx workspace layout)
- ADR-006: Observability Strategy (health checks, structured logging)
