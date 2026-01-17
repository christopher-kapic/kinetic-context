# Multi-stage build for kinetic-context

# Stage 1: Build dependencies and compile
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy workspace packages
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the applications
RUN pnpm run build

# Verify build output exists and show contents
RUN echo "Checking server build output:" && \
    ls -la /app/apps/server/dist/ || (echo "ERROR: Server dist directory not found!" && exit 1) && \
    echo "Server dist contents:" && \
    find /app/apps/server/dist -type f && \
    echo "Checking web build output:" && \
    ls -la /app/apps/web/dist/ || echo "WARNING: Web dist directory not found (may be OK if not needed)"

# Stage 2: Runtime
FROM node:20-alpine AS runtime

# Install git (needed for cloning and checking out repos)
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy built applications from builder
# Create directories first
RUN mkdir -p ./apps/server ./apps/web

# Copy server files
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json

# Verify the file exists after copy (tsdown outputs index.mjs for ESM format)
RUN ls -la ./apps/server/dist/ && \
    test -f ./apps/server/dist/index.mjs || (echo "ERROR: index.mjs not found in dist!" && ls -la ./apps/server/dist/ && exit 1)

# Copy web files
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

# Copy workspace packages
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Create directories for volumes (will be overridden by volume mounts)
RUN mkdir -p /packages /local-packages /projects /config /state

# Set environment variables
ENV NODE_ENV=production
ENV PACKAGES_DIR=/packages
ENV LOCAL_PACKAGES_DIR=/local-packages
ENV PROJECTS_DIR=/projects
ENV OPENCODE_CONFIG_PATH=/config/opencode.json
ENV OPENCODE_STATE_DIR=/state

# Expose port
EXPOSE 3000

# Start the server (tsdown outputs index.mjs for ESM format)
CMD ["node", "apps/server/dist/index.mjs"]
