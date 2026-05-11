# Multi-stage Dockerfile for Notification Service
# Target image size: < 150MB

# Stage 1: Builder
FROM node:22-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for better layer caching
COPY package*.json ./
COPY apps/notification-svc/package*.json ./apps/notification-svc/

# Install dependencies (using install to handle lock file sync issues)
RUN npm install --include=dev

# Copy source code
COPY tsconfig*.json ./
COPY apps/notification-svc ./apps/notification-svc
COPY libs ./libs

# Build the application using Nx
RUN npx nx build notification-svc --configuration=production

# Stage 2: Prune dependencies for production
FROM node:22-alpine AS pruning

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Prune to production dependencies only
RUN npm prune --omit=dev --legacy-peer-deps && npm cache clean --force

# Stage 3: Runtime
FROM node:22-alpine AS runtime

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy production dependencies
COPY --from=pruning --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist/apps/notification-svc ./dist

# Copy package.json for health check endpoint
COPY --chown=appuser:appgroup package*.json ./

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

# Start application
CMD ["node", "dist/main.js"]
