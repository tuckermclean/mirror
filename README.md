# Mirror

Rewrite your LinkedIn profile in your authentic voice with measurably better positioning.

Mirror learns who you actually are — through a life-story interview, your AI chat history, and your current LinkedIn — then rewrites your profile with per-section rationale, a recruiter-eye heatmap simulation, and inline accept/reject controls.

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ ([install](https://nodejs.org/))
- **pnpm** 8+ (install with `npm install -g pnpm`)
- **Docker** and **Docker Compose** ([install Docker Desktop](https://www.docker.com/products/docker-desktop))
- **Git**

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd mirror
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local and fill in required API keys (see Environment variables section below)
   ```

### Local Development

Start the full local development stack with one command:

```bash
docker compose up -d --wait
pnpm dev
```

This starts:
- **Next.js app**: http://localhost:3000
- **Inngest dev server**: http://localhost:8288
- **Mailhog** (email testing): http://localhost:8025

The app hot-reloads as you edit files.

### Running Tests

```bash
# Unit tests
pnpm test:unit

# Integration tests (requires DATABASE_URL)
pnpm test:integration

# E2E tests (requires running app)
pnpm test:e2e

# All checks (type checking, linting, tests)
pnpm typecheck
pnpm lint
```

For additional commands, see the [Development](#development) section below.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full domain model, ADRs, and deployment topology.

## Quick start (local, one command)

```bash
cp .env.example .env.local
# Fill in ANTHROPIC_API_KEY and other required vars in .env.local
docker compose up -d --wait
# App: http://localhost:3000
# Inngest dev: http://localhost:8288
# Mailhog: http://localhost:8025
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon/Postgres connection string |
| `REDIS_URL` | Yes | Upstash or local Redis URL |
| `CLERK_SECRET_KEY` | Yes | Clerk server-side secret |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk client-side key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `POSTHOG_API_KEY` | Yes | PostHog key |
| `INNGEST_EVENT_KEY` | Yes | Inngest event key |
| `INNGEST_SIGNING_KEY` | Yes | Inngest request signing key |
| `COOKIE_ENCRYPTION_KEY` | Yes | 32-byte base64 key (libsodium) for LinkedIn cookies |
| `R2_ACCOUNT_ID` | Yes | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret key |
| `R2_BUCKET_NAME` | No | R2 bucket name (default: `mirror-uploads`) |
| `VOYAGE_API_KEY` | Conditional | Voyage AI key (if `EMBEDDING_PROVIDER=voyage`) |
| `OPENAI_API_KEY` | Conditional | OpenAI key (if `EMBEDDING_PROVIDER=openai`) |
| `LLM_MONTHLY_CAP_USD` | No | Hard monthly Anthropic spend cap (default: `20`) |

See `.env.example` for all variables with placeholders.

## Development

```bash
pnpm install
pnpm dev              # Next.js dev server on :3000
pnpm typecheck        # TypeScript type check
pnpm lint             # ESLint
pnpm test:unit        # Vitest unit tests
pnpm test:integration # Vitest integration tests (needs DATABASE_URL)
pnpm test:e2e         # Playwright E2E tests (needs running app)
pnpm infra:test       # Docker/Helm infra tests
pnpm eval:prompts     # promptfoo LLM evals (needs ANTHROPIC_API_KEY)
pnpm db:generate      # Generate Drizzle migration from schema
pnpm db:push          # Push schema to DB (dev only)
```

## Deployment

See [DEPLOY.md](DEPLOY.md) for all four deployment paths:
- Vercel + Neon + Railway worker
- docker-compose on a VPS
- Helm on Kubernetes
- Free-tier: Oracle Cloud ARM + k3s + Neon free (the portfolio k8s path)

## Testing philosophy

Strict red-green-refactor TDD throughout. Every feature starts with a failing test. See [TDD.md](TDD.md) for the discipline and how to add a new layer.

## Key documents

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, domain model, 8 ADRs |
| [THREAT_MODEL.md](THREAT_MODEL.md) | STRIDE analysis, 32 threats, mitigations |
| [COMPLIANCE.md](COMPLIANCE.md) | LinkedIn ToS, GDPR/CCPA, EU AI Act |
| [MOAT.md](MOAT.md) | 9 moat layers + metrics (Wk 6) |
| [EVALS.md](EVALS.md) | Prompt eval scores (Wk 3+) |
| [TDD.md](TDD.md) | TDD discipline + how to add a layer (Wk 6) |

✨
