# syntax=docker/dockerfile:1.7
# Meme'd web app — multi-stage production image (Next.js standalone output).
# Build from the REPOSITORY ROOT:
#   docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=/api -t memed-frontend .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --workspace frontend --no-audit --no-fund

FROM deps AS build
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time.
# They must never contain secrets. Behind one ALB, "/api" keeps everything same-origin.
ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_TELEMETRY_DISABLED=1
COPY frontend/ frontend/
RUN npm run build --workspace frontend

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "frontend/server.js"]
