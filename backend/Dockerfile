# syntax=docker/dockerfile:1.7
# Meme'd API — multi-stage production image.
# Build from the REPOSITORY ROOT (one lockfile for the npm workspace):
#   docker build -f backend/Dockerfile -t memed-backend .

ARG NODE_IMAGE=node:22-bookworm-slim

# 1. All dependencies (incl. dev) for compiling TypeScript.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --workspace backend --no-audit --no-fund

# 2. Compile.
FROM deps AS build
COPY backend/tsconfig.json backend/tsconfig.build.json backend/
COPY backend/src backend/src
RUN npm run build --workspace backend

# 3. Production-only dependencies (no jest, no TypeScript).
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --workspace backend --omit=dev --no-audit --no-fund \
 && mkdir -p backend/node_modules

# 4. Runtime: non-root, no build tooling, no secrets baked in.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --chown=node:node backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
USER node
WORKDIR /app/backend
EXPOSE 4000
# Liveness only; the load balancer uses /api/health/ready for readiness.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Node runs as PID 1 and handles SIGTERM itself (drains HTTP, closes Mongo/Redis).
CMD ["node", "dist/server.js"]
