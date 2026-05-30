# Mirror — AGENTS.md

> Context file for AI coding agents. The open standard — read by Claude Code,
> Codex, Cursor, Copilot, Gemini, Windsurf, and others.
> Do not edit CLAUDE.md — it is a 2-line import stub pointing here.

## Project Overview

Mirror is a personalized LinkedIn profile rewriter. It learns who someone
actually is — through a conversational life-story interview, their uploaded
AI chat history (ChatGPT/Claude exports), and their current LinkedIn profile —
then rewrites their profile in their authentic voice with per-section rationale,
a recruiter-eye heatmap simulation, and inline accept/reject controls.

Full specification: `SPEC.md`. Architecture decisions: `ARCHITECTURE.md`.
Threat model: `THREAT_MODEL.md`. Compliance posture: `COMPLIANCE.md`.
All implementation decisions must be consistent with these documents.

## Tech Stack

- **Language:** TypeScript (strict mode, `tsconfig.json`)
- **Framework:** Next.js 15 (App Router, React Server Components)
- **UI:** Tailwind CSS v4, shadcn/ui, Framer Motion
- **Database:** Postgres (Neon) via Drizzle ORM, pgvector extension
- **Auth:** Clerk (`@clerk/nextjs`)
- **LLM:** Anthropic SDK (`@anthropic-ai/sdk`), Vercel AI SDK (`ai`)
- **Embeddings:** Voyage AI (default) or OpenAI — provider abstracted in `src/lib/embeddings/`
- **Job queue:** Inngest v4 (cloud or self-hosted)
- **Background worker:** Playwright (separate `worker/` process / `Dockerfile.worker`)
- **Payments:** Stripe
- **Analytics:** PostHog
- **File storage:** Cloudflare R2 (S3-compatible)
- **Crypto:** libsodium-wrappers (session cookie encryption, prompt hashing)
- **Package manager:** pnpm (never npm or yarn)
- **Testing:** Vitest (unit + integration), Playwright (E2E + visual + a11y), promptfoo (LLM evals)

## Dev Environment

```bash
pnpm install           # Install dependencies
cp .env.example .env.local && vi .env.local  # Fill in required vars
docker compose up -d --wait  # Start full local stack (app :3000, Inngest :8288, Mailhog :8025)
pnpm dev               # Next.js hot-reload dev server (alternative to Docker)
pnpm typecheck         # TypeScript type check (must pass before any PR)
pnpm lint              # ESLint (zero warnings policy)
pnpm test:unit         # Vitest unit tests
pnpm test:integration  # Vitest integration tests (requires DATABASE_URL)
pnpm test:e2e          # Playwright E2E (requires running app)
pnpm test:visual       # Playwright visual regression
pnpm test:a11y         # axe-core a11y tests
pnpm eval:prompts      # promptfoo LLM evals (requires ANTHROPIC_API_KEY)
pnpm infra:test        # Docker/Helm infra tests
pnpm db:generate       # Generate Drizzle migration from schema changes
pnpm db:push           # Push schema to DB (dev only — never in prod)
pnpm db:migrate        # Run migrations (prod path)
```

### One-time Clerk setup (new repo / new Clerk app)

The Clerk dev instance requires specific configuration for E2E tests to work.
Run this **once** after creating or linking the Clerk app:

```bash
clerk auth login       # Authenticate the Clerk CLI
clerk link             # Link this repo to the Mirror Clerk app
pnpm setup:clerk       # Enable email+password sign-in, create E2E test user,
                       # write CLERK_TEST_USER_* GitHub secrets
```

Then manually set the API keys from https://dashboard.clerk.com → API Keys:

```bash
gh secret set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  # pk_test_...
gh secret set CLERK_SECRET_KEY                   # sk_test_...
```

**Why this is needed:** Clerk's default dev instance only enables `email_code`
(OTP) sign-in. `pnpm setup:clerk` adds `email_password` via the BAPI so that
`clerk.signIn({ strategy: "password", ... })` works in Playwright E2E tests.
Skipping this step causes all `interview.spec.ts` tests to silently fail.

## TDD — The Inviolable Rule

**No production code without a failing test that demands it.**

Every feature follows this loop, in order:
1. **Red** — Write failing tests. Run them. Confirm they fail for the right reason. Commit: `test(scope): add failing tests for X`
2. **Green** — Write minimum code to pass tests. Commit: `feat(scope): implement X to pass tests`
3. **Refactor** — Clean up with tests green. Commit: `refactor(scope): ...`
4. **Review gate** — The Code Reviewer agent reviews the diff before the next layer begins.

This applies to everything: route handlers, lib functions, prompts, Drizzle schema, Inngest functions. If you are about to write implementation code without a corresponding failing test, **stop and write the test first**.

For LLM prompts specifically:
- Write the `promptfoo` eval config and the rubric BEFORE writing the prompt itself
- The eval must define behavioral assertions (JSON schema compliance, no hallucinated jobs, voice fidelity score ≥ baseline)
- CI blocks merges on prompt eval regression

## Architecture Rules

- **ORM:** Drizzle only. No Prisma. No raw `sql` client outside of pgvector operators (use Drizzle's `sql` template tag for `<=>`, `<#>`, `<->`). Schema in `src/db/schema.ts`.
- **Auth first:** Every route handler and Server Action calls `const { userId } = await auth()` as its **first line**. If `!userId` return 401 immediately. No exceptions.
- **PII reads:** Reads from `interviews.transcript`, `imports.raw_path`, `imports.parsed`, `linkedin_snapshots.raw_html` MUST go through `src/lib/db/pii-read.ts`. Direct `db.select()` on these columns is a lint error.
- **Session cookie:** The LinkedIn `li_at` cookie is encrypted at rest with libsodium `secretstream`. It is decrypted only in the Playwright worker, in memory, for the duration of the scrape. Never log it. Never return it to the client. Never write it to disk.
- **LLM cost control:** Before every generation call, query `llm_spend_ledger` for MTD spend. If `mtd_spend >= LLM_MONTHLY_CAP_USD` (default `$20`), return HTTP 402 with `{ error: "monthly_cap_reached", resets_at: "..." }`. After every Anthropic API call, write the cost from `response.usage` to `llm_spend_ledger`. Never estimate — use the actual metadata.
- **Prompt caching:** Before calling the LLM for generation, compute `prompt_hash = SHA-256(JSON.stringify({systemPrompt, userMessages, modelId}))`. Check for a matching `generations` row within 24h. Return the cached output if found.
- **Streaming:** All interview chat and generation pipeline calls MUST use the Anthropic streaming API. Never block on a non-streaming response for user-facing operations.
- **Inngest:** All long-running jobs (scraping, embedding, generation orchestration, email) go through Inngest functions in `src/inngest/`. Never do long-running work in a route handler.
- **Embedding cache:** Check `voice_embedding IS NOT NULL` and `embedding IS NOT NULL` before calling the embedding API. Never re-embed a row that already has a non-null embedding unless explicitly re-importing.
- **Deployment portability:** Do not use any Vercel-specific Next.js features (Edge Runtime, ISR, Vercel-specific headers). The app must run identically on Vercel, docker-compose, and Kubernetes.

## Code Style

- TypeScript strict mode always. `any` requires a `// eslint-disable` comment with justification.
- `pnpm` only. Never run `npm install` or `yarn add`.
- Framer Motion for all UI animations — no CSS transitions for user-facing motion.
- shadcn/ui components for all UI elements — do not create bespoke components for things shadcn covers.
- Functions over 40 lines should almost certainly be split.
- Async/await always. No `.then()` chains.
- Errors in lib functions: return typed `Result<T, E>` or throw with a typed error class from `src/lib/errors.ts`. Never `throw new Error("string")` naked.
- `console.log` in production code is a lint error. Use the structured logger in `src/lib/logger.ts`.

## Git Conventions

- Branches: `feat/`, `fix/`, `design/`, `refactor/`, `docs/`, `chore/`, `test/`
- Commits: imperative mood, under 72 chars, scope in parens: `feat(interview): add streaming chat route`
- One logical change per commit
- PRs reference the issue: "Closes #N"
- Never force-push to `master`

## Testing

- Unit tests: `tests/unit/` — pure logic, no DB, no network, Vitest
- Integration tests: `tests/integration/` — Drizzle against real DB, Vitest
- E2E tests: `tests/e2e/` — full user flows, Playwright
- Visual regression: `tests/visual/` — golden screenshots, Playwright
- A11y tests: `tests/a11y/` — axe-core via Playwright, WCAG AA minimum
- LLM evals: `evals/` — promptfoo, rubric-graded, run with `pnpm eval:prompts`
- Coverage: `src/` ≥ 80% lines; `src/lib/crypto/` and `src/lib/parsers/` = 100%
- Every public function has at least one test before the implementation exists

## Agent Routing (Claude Code)

Agents installed at `~/.claude/agents/`. Routing via `dispatch.yml`.

**Core agents for this repo:**

| Task type | Agent | Model |
|-----------|-------|-------|
| Default implementation | `engineering/engineering-senior-developer.md` | Sonnet |
| Prompt engineering, evals, Voice Card, RAG | `engineering/engineering-ai-engineer.md` | Sonnet |
| Generation prompt quality review | `marketing/marketing-linkedin-content-creator.md` | Sonnet |
| Database schema, pgvector, query tuning | `engineering/engineering-database-optimizer.md` | Sonnet |
| Auth, cookies, PII, crypto, threat model | `engineering/engineering-security-engineer.md` | Sonnet |
| CI/CD, Dockerfile, Helm, GitHub Actions | `engineering/engineering-devops-automator.md` | Sonnet |
| Walkthrough UI, diff view, heatmap | `engineering/engineering-frontend-developer.md` | Sonnet |
| Walkthrough micro-interactions, rationale pills | `design/design-whimsy-injector.md` | Sonnet |
| Interview flow, UX design | `design/design-ux-researcher.md` | Sonnet |
| Design system, LinkedIn pixel-faithful renderer | `design/design-ui-designer.md` | Sonnet |
| Accessibility (WCAG AA, keyboard nav) | `testing/testing-accessibility-auditor.md` | Sonnet |
| Architecture, ADRs, cross-cutting decisions | `engineering/engineering-software-architect.md` | **Opus** |
| Security audits, threat modeling | `engineering/engineering-security-engineer.md` | **Opus** (use-opus label) |
| Final pre-merge certification | `testing/testing-reality-checker.md` | Sonnet |

Default model: Sonnet. Add `use-opus` label for architecture/security audit tasks.

## What NOT To Do

- Do not use Prisma — Drizzle only
- Do not use npm or yarn — pnpm only
- Do not use `any` without a lint-disable comment and justification
- Do not write raw SQL outside the `sql` template tag for pgvector operators
- Do not log or return the LinkedIn session cookie (`li_at`) anywhere
- Do not read PII columns directly — use `src/lib/db/pii-read.ts`
- Do not write production code before a failing test exists
- Do not call the Anthropic API without first checking the monthly spend cap
- Do not add `NEXT_RUNTIME=edge` or Vercel-specific config — keep the app portable
- Do not add new `npm` dependencies without justification in the PR description
- Do not modify `ARCHITECTURE.md`, `THREAT_MODEL.md`, or `COMPLIANCE.md` without a new ADR or human approval
- Do not modify `.github/workflows/` without human approval
- Do not modify `AGENTS.md` without human approval
