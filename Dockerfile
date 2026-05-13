# syntax=docker/dockerfile:1
# requires output: "standalone" in next.config.ts for the standalone build to exist

# Multi-arch support: pass --platform=$BUILDPLATFORM to docker buildx
ARG BUILDPLATFORM
ARG TARGETPLATFORM

# ---------------------------------------------------------------------------
# Stage 1: deps — install production + dev dependencies
# ---------------------------------------------------------------------------
FROM --platform=${BUILDPLATFORM:-linux/amd64} node:20-alpine AS deps

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lockfile and manifest first for layer cache efficiency
COPY pnpm-lock.yaml package.json ./

# Frozen install ensures reproducibility; includes devDeps needed by builder
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: builder — compile the Next.js application
# ---------------------------------------------------------------------------
FROM --platform=${BUILDPLATFORM:-linux/amd64} node:20-alpine AS builder

WORKDIR /app

# Build-time public env vars injected via --build-arg
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY

ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Pull installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source (lockfile already cached above via deps stage)
COPY package.json pnpm-lock.yaml ./
COPY . .

# next.config.ts must have output: 'standalone' for this to produce
# .next/standalone — without it the runner stage will fail to find server.js
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 3: runner — distroless production image
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

EXPOSE 3000

# server.js is the Next.js standalone entry point
CMD ["server.js"]
