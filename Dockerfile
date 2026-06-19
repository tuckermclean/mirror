# syntax=docker/dockerfile:1
# requires output: "standalone" in next.config.ts for the standalone build to exist

# Multi-arch support: pass --platform=$BUILDPLATFORM to docker buildx
ARG BUILDPLATFORM
ARG TARGETPLATFORM

# ---------------------------------------------------------------------------
# Stage 1: builder — install all deps and compile the Next.js application
# ---------------------------------------------------------------------------
FROM --platform=${BUILDPLATFORM:-linux/amd64} node:20-alpine AS builder

WORKDIR /app

# Build-time public env vars injected via --build-arg
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY

ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lockfile and manifest first for layer cache efficiency
COPY pnpm-lock.yaml package.json ./

# Full install (devDeps required: TypeScript for next.config.ts compilation).
# --ignore-scripts prevents node-gyp on Alpine's musl libc; rebuild only
# the three packages that ship prebuilt Alpine binaries.
# NODE_ENV is NOT set here so pnpm includes devDependencies.
RUN pnpm install --frozen-lockfile --ignore-scripts && \
    pnpm rebuild esbuild sharp unrs-resolver

COPY . .

# Set NODE_ENV after install so Next.js builds in production mode
ENV NODE_ENV=production
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 2: runner — distroless production image
# Target size budget: < 250 MB compressed
# ---------------------------------------------------------------------------
FROM gcr.io/distroless/nodejs20-debian12 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user (distroless provides uid 1001 as "nonroot")
USER 1001:1001

# Standalone output contains a self-contained server.js with all
# required node_modules inlined — no npm/pnpm needed at runtime
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=builder --chown=1001:1001 /app/public ./public
# Migration script and SQL files — used by the db-migrate Helm Job
COPY --from=builder --chown=1001:1001 /app/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=1001:1001 /app/scripts/migrate.mjs ./scripts/migrate.mjs

EXPOSE 3000

# server.js is the Next.js standalone entry point
CMD ["server.js"]
