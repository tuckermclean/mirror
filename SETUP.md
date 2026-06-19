# Mirror — Local Development Setup

> Get a freshly cloned repo to a working app with **all test suites green**.
> For production deployment (Vercel, docker-compose on a VPS, Kubernetes), see
> [DEPLOY.md](DEPLOY.md) instead — this guide is local-dev only.

By the end of this guide you will have:

- The full stack running locally (Next.js app, Postgres+pgvector, Redis, Inngest, Mailhog, worker)
- A migrated and seeded database
- Every test suite runnable, and a single `make ci` command to prove your environment is correct

If anything here is wrong or unclear, that is a documentation bug — please open an issue.

---

## 1. Prerequisites

Install these before you start. **Use the versions below** — they come from
`package.json` `engines`, which is authoritative.

| Tool | Required version | How to get it |
|---|---|---|
| **Node.js** | `>=20.0.0` | [nodejs.org](https://nodejs.org/) or `nvm install 20` |
| **pnpm** | `>=10.0.0` | `corepack enable && corepack prepare pnpm@latest --activate` (or see [pnpm.io/installation](https://pnpm.io/installation)) |
| **Docker** + **Docker Compose v2** | current | [Docker Desktop](https://www.docker.com/products/docker-desktop) (Compose v2 is the `docker compose` subcommand, not the legacy `docker-compose` binary) |
| **Git** | current | [git-scm.com](https://git-scm.com/) |

> **Note:** This project uses **pnpm only**. Never run `npm install` or `yarn` —
> it is a hard project rule and will produce an inconsistent lockfile.

> The `engines` field in `package.json` is the authoritative source for required
> Node.js and pnpm versions — always defer to it over any other reference.

**Playwright system dependencies** (needed only for E2E, visual, a11y, and perf
suites) are installed separately — see [§6.3](#63-e2e-tests). Install browsers
and OS libraries with:

```bash
make playwright-install   # runs: pnpm exec playwright install --with-deps
```

---

## 2. Clone & install

```bash
git clone <repository-url>
cd mirror
pnpm install
```

For a reproducible install that matches CI exactly, use the frozen lockfile
(this is what `make install` runs):

```bash
pnpm install --frozen-lockfile
```

---

## 3. Secrets & environment variables

This is the section that most often blocks new developers, so it gets first-class
treatment.

### How env vars are loaded

```bash
cp .env.example .env.local
```

- `.env.local` is **gitignored** and must **never** be committed. It holds your
  real secrets.
- `.env.example` is the committed template with placeholder values.
- The docker-compose `web`, `worker`, and `seed` services read `.env.local` via
  `env_file`, and **override** `DATABASE_URL` and `REDIS_URL` to point at the
  in-network containers (see [§3.3](#33-database_url-and-redis_url)).

### 3.1 What you actually need (by workflow)

You do **not** need every key to start working. Most can stay as the
`replace_me` placeholders from `.env.example` until the workflow that uses them.

| Workflow | Keys that must be real |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm infra:test` | None — placeholders are fine (no DB, no network) |
| `pnpm test:unit` (standalone) | None — placeholders fine. **Note:** `make test-unit` / `make ci` also runs `pnpm eval:spearman`, which requires a real `ANTHROPIC_API_KEY`. |
| `pnpm test:integration` / `make test-integration` | `DATABASE_URL` pointing at a migrated Postgres+pgvector instance |
| `pnpm dev` / `docker compose up` (running the app) | `COOKIE_ENCRYPTION_KEY` (real), `DATABASE_URL`, `REDIS_URL`; Clerk keys to exercise auth; `ANTHROPIC_API_KEY` to actually generate |
| `pnpm test:e2e` (and visual/a11y/perf) | Running app **plus** Clerk configured for password sign-in (see [§3.4](#34-one-time-clerk-setup-required-for-e2e)) |
| `pnpm eval:prompts`, `pnpm eval:spearman` | `ANTHROPIC_API_KEY` (real) |

### 3.2 Full variable reference

Pulled from `.env.example`. "Required for local dev" means you need a real value
to run the app and its full test matrix; "Optional / external" can stay as a
placeholder unless you are exercising that integration.

| Variable | Required for local dev | How to obtain / generate |
|---|---|---|
| `DATABASE_URL` | Yes | Local: `postgres://mirror:mirror@localhost:5432/mirror` (from `.env.example`). Compose overrides this to `postgres://mirror:mirror@postgres:5432/mirror` for the `web`, `worker`, and `seed` services. |
| `REDIS_URL` | Yes | Local: `redis://localhost:6379` (assumes Docker-managed Redis on that port). Compose overrides to `redis://redis:6379` for in-network services. If you have a system Redis already bound to `:6379`, `pnpm dev` may connect to it instead — stop the system Redis or change its port to avoid contaminating rate-limit and session state. |
| `COOKIE_ENCRYPTION_KEY` | Yes | 32-byte base64. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (equivalent to DEPLOY.md's `openssl rand -base64 32`). ⚠️ Rotating this key invalidates all existing encrypted cookies (users are signed out). See `THREAT_MODEL.md §4.1` for the key rotation procedure. |
| `CLERK_SECRET_KEY` | For auth / E2E | Clerk dashboard → API Keys (`sk_test_...`) |
| `CLERK_PUBLISHABLE_KEY` | For auth / E2E | Clerk dashboard → API Keys (`pk_test_...`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | For auth / E2E | Same `pk_test_...`; injected at Next.js build time |
| `ANTHROPIC_API_KEY` | For generation & evals | [console.anthropic.com](https://console.anthropic.com/) (`sk-ant-...`) |
| `LLM_MONTHLY_CAP_USD` | No (default `20`) | Hard monthly spend cap — generation returns HTTP 402 when exceeded |
| `STRIPE_SECRET_KEY` | Optional / external | Stripe dashboard (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Optional / external | Stripe CLI / dashboard (`whsec_...`) |
| `POSTHOG_API_KEY` | Optional / external | PostHog project settings (`phc_...`) |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional / external | Same PostHog key; injected at build time |
| `INNGEST_EVENT_KEY` | Optional locally | Any value locally — the dockerized Inngest dev server does not validate it |
| `INNGEST_SIGNING_KEY` | Optional locally | Same as above |
| `R2_ACCOUNT_ID` | Optional / external | Cloudflare R2 dashboard |
| `R2_ACCESS_KEY_ID` | Optional / external | Cloudflare R2 dashboard |
| `R2_SECRET_ACCESS_KEY` | Optional / external | Cloudflare R2 dashboard |
| `R2_BUCKET_NAME` | No (default `mirror-uploads`) | Cloudflare R2 bucket name |
| `EMBEDDING_PROVIDER` | No (default `voyage`) | `voyage` or `openai` |
| `VOYAGE_API_KEY` | Conditional | Required when `EMBEDDING_PROVIDER=voyage`. [voyageai.com](https://www.voyageai.com/) |
| `OPENAI_API_KEY` | Conditional | Required when `EMBEDDING_PROVIDER=openai`. [platform.openai.com](https://platform.openai.com/) |
| `EVAL_MODEL` | No (default `claude-sonnet-4-6`) | Override per-run: `EVAL_MODEL=<model-id> pnpm eval:voice` |

### 3.3 `DATABASE_URL` and `REDIS_URL`

These differ depending on **where the process runs**:

- **Inside docker-compose** (the `web`, `worker`, `seed` services): Compose
  overrides them to the container network names —
  `postgres://mirror:mirror@postgres:5432/mirror` and `redis://redis:6379`.
  You do not set these yourself for those services.
- **On the host** (e.g. `pnpm dev`, or `pnpm test:integration`): use the
  `localhost` forms from `.env.example` —
  `postgres://mirror:mirror@localhost:5432/mirror` and `redis://localhost:6379`.
  These reach the dockerized Postgres/Redis via their published ports (5432,
  6379).

### 3.4 One-time Clerk setup (required for E2E)

E2E tests sign in with a password. **Clerk's default dev instance only enables
`email_code` (OTP) sign-in**, so `clerk.signIn({ strategy: "password", ... })`
in Playwright will silently fail — `tests/e2e/interview.spec.ts` and the other
auth-dependent specs just won't pass.

Run this **once** after creating or linking the Clerk app:

```bash
clerk auth login       # Authenticate the Clerk CLI
clerk link             # Link this repo to the Mirror Clerk app
pnpm setup:clerk       # Enable email+password sign-in, create the E2E test user,
                       # write CLERK_TEST_USER_* GitHub secrets
```

`pnpm setup:clerk` adds `email_password` via the Clerk Backend API so password
sign-in works. **If you skip it, the E2E auth/interview tests fail silently.**

Then set the API keys from the [Clerk dashboard](https://dashboard.clerk.com) →
API Keys into your `.env.local` (and, for CI, as GitHub secrets):

```bash
gh secret set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   # pk_test_... (public key — injected at Next.js build time)
gh secret set CLERK_SECRET_KEY                    # sk_test_...
```

---

## 4. Start the local stack

The full stack is defined in `docker-compose.yml`. Bring everything up and wait
for health checks:

```bash
docker compose up -d --wait
```

This starts:

| Service | Purpose | Address |
|---|---|---|
| `postgres` | pgvector-enabled Postgres 16 | `localhost:5432` |
| `redis` | Session store, Inngest event bus, rate limiting | `localhost:6379` |
| `inngest` | Local Inngest dev server (replaces Inngest Cloud) | http://localhost:8288 |
| `mailhog` | SMTP capture for transactional mail | SMTP `localhost:1025`, UI http://localhost:8025 |
| `web` | Next.js application | http://localhost:3000 |
| `worker` | Playwright scraper + Inngest function host | (internal) |
| `seed` | One-shot: `drizzle-kit push` + `node scripts/seed.js`, then exits | — |

The `seed` service runs migrations and demo seed data once, then exits cleanly
(`restart: "no"`) — that is expected, not a crash.

### Compose profiles

| Profile | Services |
|---|---|
| `default` (no flag) | everything: postgres, redis, inngest, mailhog, web, worker, seed |
| `lite` | web + postgres + redis only |
| `e2e` | everything + the Playwright test runner |

```bash
docker compose up -d --wait                      # default — full stack
docker compose --profile lite up -d --wait       # lighter: web + postgres + redis
docker compose --profile e2e up -d --wait        # full stack + test runner
```

Tear down (data survives):

```bash
docker compose down        # stop services, keep volumes
docker compose down -v     # also wipe postgres_data and redis_data
```

### Alternative: run the app on the host

Run only the backing services in Docker and run Next.js directly on your host
for the fastest hot-reload loop:

```bash
docker compose up -d --wait postgres redis   # backing services only (no web container)
pnpm dev                                      # Next.js on http://localhost:3000
```

With `pnpm dev`, ensure `DATABASE_URL`/`REDIS_URL` in `.env.local` use the
`localhost` forms ([§3.3](#33-database_url-and-redis_url)).

> **Hot reload in Docker:** set `DEV_SRC_MOUNT=./src` before `docker compose up`
> to bind-mount `src/` into the `web` container so edits hot-reload without a
> rebuild. Unset, it defaults to `/dev/null` (no mount).

---

## 5. Database setup

The `seed` service handles this automatically on `docker compose up`. To do it
manually (or against a host Postgres):

```bash
make db-push        # Dev: push the Drizzle schema directly (authoritative interactive path — adds --force)
pnpm db:generate    # Generate a migration from schema changes
pnpm db:migrate     # Prod path: apply generated migrations
node scripts/seed.js   # Load demo data
```

**Integration tests require a migrated Postgres+pgvector instance** reachable via
`DATABASE_URL`. The dockerized `postgres` service (image `pgvector/pgvector:pg16`)
provides pgvector; run `make db-push` against it before `pnpm test:integration`
if you are not using the `seed` service.

---

## 6. Running each test suite

Each suite and exactly what it needs. Quality gates first, then the test matrix.

### Quality gates

```bash
pnpm typecheck   # tsc --noEmit (must pass before any PR)
pnpm lint        # ESLint — zero-warnings policy
```

### 6.1 Unit tests

```bash
pnpm test:unit
```

Vitest, `tests/unit/`. Pure logic — **no DB, no network**. Placeholder env vars
are fine.

### 6.2 Integration tests

```bash
pnpm test:integration
```

Vitest, `tests/integration/`, run against a **real, migrated** Postgres+pgvector
via `DATABASE_URL`. `make test-integration` runs the focused db/health/rag
suites:

```bash
make test-integration   # pnpm vitest run tests/integration/db tests/integration/health tests/integration/rag
```

### 6.3 E2E tests

```bash
make playwright-install   # one-time: install browsers + OS deps
pnpm test:e2e             # Playwright, tests/e2e
```

Requires a **running app** (`docker compose up` or `pnpm dev`) **and** Clerk
configured for password sign-in ([§3.4](#34-one-time-clerk-setup-required-for-e2e)).

### 6.4 Visual, a11y, and perf tests

```bash
pnpm test:visual   # Playwright — golden-screenshot regression
pnpm test:a11y     # Playwright + axe-core — WCAG AA
pnpm test:perf     # Playwright — performance budgets
```

All Playwright-based; run `make playwright-install` first and have the app
running.

### 6.5 Infra tests

```bash
pnpm infra:test    # Vitest, tests/infra — Docker / Helm checks
```

No app or DB needed.

### 6.6 LLM evals

```bash
pnpm eval:prompts    # = eval:interview + eval:voice (promptfoo)
pnpm eval:spearman   # Vitest voice-match Spearman correlation
```

All require a real `ANTHROPIC_API_KEY`. Override the model with
`EVAL_MODEL=<model-id> pnpm eval:voice`.

### 6.7 Coverage

```bash
pnpm coverage
```

Runs unit + integration + infra with V8 coverage. Thresholds: `src/` ≥ 80%
lines; `src/lib/crypto/` and `src/lib/parsers/` = **100%**.

### 6.8 The all-in-one check: `make ci`

The recommended "is my environment correct?" gate. It mirrors CI's blocking set
and catches the common failure modes before you push:

```bash
make ci   # install → typecheck → lint → test-unit → test-integration → build → smoke
```

> **Note:** `make ci` runs `test-unit` as blocking. In `ci.yml` the unit step is
> `continue-on-error` because it includes some intentionally-RED suites (part of
> the TDD discipline). Locally, expect those specific suites to be red — that is
> by design, not a broken environment.

> **`ANTHROPIC_API_KEY` required for `test-unit`:** The `test-unit` Makefile
> target bundles `pnpm eval:spearman` (voice-match Spearman correlation eval),
> which calls the Anthropic API. If `ANTHROPIC_API_KEY` is a placeholder, this
> step will fail with an authentication error mid-`make ci`. Set a real key
> before running `make ci`, or run `pnpm vitest run tests/unit` directly to skip
> the eval step.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| First DB request after idle hangs/errors | Neon (or Postgres) cold-start | Retry; ensure `DATABASE_URL` is reachable and migrated. Locally, confirm the `postgres` container is healthy: `docker compose ps`. |
| E2E auth/interview specs fail with no clear error | Clerk dev instance only has `email_code`; password sign-in disabled | Run the one-time Clerk setup: `clerk auth login && clerk link && pnpm setup:clerk` ([§3.4](#34-one-time-clerk-setup-required-for-e2e)). |
| Playwright: "Executable doesn't exist" / missing browser | Browsers/OS deps not installed | `make playwright-install` |
| Generation returns HTTP 402 `monthly_cap_reached` | Monthly spend hit `LLM_MONTHLY_CAP_USD` (default `$20`) | Raise `LLM_MONTHLY_CAP_USD` in `.env.local` (local dev only), or wait — the ledger resets automatically at the start of the next calendar month. |
| `docker compose up` fails binding a port | Port already in use | Free the conflicting port — the stack uses **3000** (web), **5432** (postgres), **6379** (redis), **8288** (inngest), **1025/8025** (mailhog). |
| Integration tests fail on connection / missing extension | Postgres not migrated or not pgvector | Use the `pgvector/pgvector:pg16` container and run `make db-push` against it first. |
| Lockfile / phantom dependency errors | Installed with npm or yarn | Delete `node_modules`, reinstall with `pnpm install` (pnpm only). |

---

## Next steps

- [README.md](README.md) — project overview and command reference
- [AGENTS.md](AGENTS.md) — architecture rules, code style, and conventions
- [ARCHITECTURE.md](ARCHITECTURE.md) — domain model and ADRs
- [DEPLOY.md](DEPLOY.md) — production deployment paths
