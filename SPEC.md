# Claude Code Prompt: "Mirror" — The Personalized LinkedIn Profile Rewriter

Paste everything below into Claude Code. Run from an empty directory.

---

## Project: Mirror

Build **Mirror**, a web app that learns who someone actually is — through conversation, their AI chat history, and their current LinkedIn — then rewrites their LinkedIn profile in their authentic voice with measurably better positioning. Show them a perfect mock walkthrough before any change goes live. Architect from day one for a defensible moat in personalized professional identity.

You are the senior engineer. Make pragmatic decisions, ask me only when something is genuinely ambiguous, and build it end-to-end. **You will use specialized agents from The Agency (§0) and strict test-driven development (§7) throughout.**

---

## 0. Agent casting — invoke these specialists, not vanilla Claude

Before you start, install The Agency:

```bash
git clone https://github.com/msitarzewski/agency-agents.git /tmp/agency-agents
cd /tmp/agency-agents && ./scripts/install.sh --tool claude-code --no-interactive
```

Then **delegate the following tasks to the named agent** rather than handling them yourself. Each pick is justified — these are places where the agent's specialization meaningfully beats a generalist pass. For routine glue code (route wiring, simple components, config), don't bother — just write it.

### Architecture & design phase
- **Software Architect** (`engineering-software-architect`) → produces `ARCHITECTURE.md` with trade-off analysis, domain model, and ADRs *before any code is written*. This is the only way the system stays coherent across 6 weeks.
- **UX Researcher** (`design-ux-researcher`) → designs the life-story interview flow in §1.2. Behavioral interview design is its actual specialty; vanilla will produce generic chatbot Q&A.
- **UI Designer** (`design-ui-designer`) → owns the design system, the walkthrough's pixel-faithful LinkedIn rendering, and the diff view aesthetic.

### LLM / AI core
- **AI Engineer** (`engineering-ai-engineer`) → owns `/lib/prompts/`, embedding pipelines, Voice Card extraction, RAG retrieval into generation, and the eval harness. This is the heart of the product.
- **LinkedIn Content Creator** (`marketing-linkedin-content-creator`) → reviews and stress-tests every generation prompt. Specifically knows what lands on LinkedIn (headline patterns, About hooks, bullet structures). Pair-prompt with AI Engineer.

### Frontend — the conversion moment
- **Frontend Developer** (`engineering-frontend-developer`) → builds the walkthrough in §5. Pixel-faithful LinkedIn clone + Framer Motion diff reveal.
- **Whimsy Injector** (`design-whimsy-injector`) → micro-interactions on the "Why?" rationale pills, recruiter-eye heatmap reveal, confidence-score animation. Every touch must serve a functional purpose; this agent enforces that.
- **Behavioral Nudge Engine** (`product-behavioral-nudge-engine`) → designs the scroll-to-unlock-commit mechanic and the weekly outcome-reporting flow. The moat depends on outcome data; this agent maximizes capture rate ethically.

### Backend / data
- **Database Optimizer** (`engineering-database-optimizer`) → owns the pgvector schema, indexing strategy for benchmark-profile k-NN retrieval, and query tuning. At 5k+ benchmark profiles with 3072-dim vectors, naive setup will be slow.
- **Security Engineer** (`engineering-security-engineer`) → owns LinkedIn session-cookie encryption, threat model, PII handling, "delete everything" flow. Non-negotiable; do a threat-modeling pass *before* writing the auth code.

### Infrastructure & deployment
- **DevOps Automator** (`engineering-devops-automator`) → owns `Dockerfile`, `Dockerfile.worker`, `docker-compose.yml`, the Helm charts in `infra/helm/`, and the GitHub Actions pipelines. Without this agent, Vercel becomes the only path to running this app — unacceptable for portability and self-hosting.
- **SRE** (`engineering-sre`) → defines SLOs (p95 generation < 30s, walkthrough TTFB < 400ms, scraper success rate ≥ 98%), error budgets, liveness/readiness probes, PodDisruptionBudgets, HPAs, and the OpenTelemetry wiring inside the charts.

### Compliance & legal
- **Legal Compliance Checker** (`support-legal-compliance-checker`) → produces `COMPLIANCE.md` covering: LinkedIn ToS posture for scraping with user-provided session, GDPR/CCPA on storing ChatGPT/Claude exports, recruiter-side B2B data-use disclosures, EU AI Act transparency obligations.

### Testing (you'll lean on these constantly — see §7 TDD)
- **API Tester** (`testing-api-tester`) → writes failing endpoint tests *before* route handlers exist.
- **Evidence Collector** (`testing-evidence-collector`) → screenshot-based visual regression on the walkthrough. Demands visual proof of every change.
- **Accessibility Auditor** (`testing-accessibility-auditor`) → WCAG audit of the walkthrough diff view, keyboard nav for accept/reject, screen-reader pass on rationale hovers.
- **Performance Benchmarker** (`testing-performance-benchmarker`) → walkthrough render perf, generation latency, scraper throughput.

### Review gates
- **Code Reviewer** (`engineering-code-reviewer`) → runs at the close of each phase before merge.
- **Reality Checker** (`testing-reality-checker`) → final production-readiness certification before the launch tag.

### Moat extension
- **Growth Hacker** (`marketing-growth-hacker`) → designs the Hall of Rewrites viral loop and the referral mechanics in §6.8.
- **AI Citation Strategist** (`marketing-ai-citation-strategist`) → new moat layer: get Mirror cited by ChatGPT, Claude, Gemini, and Perplexity when users ask how to improve their LinkedIn. See §6.9.

**Invocation pattern in your sessions:**

```
Use the Software Architect agent to produce ARCHITECTURE.md given §1–§6 of this spec.
Use the AI Engineer agent to write the Voice Card extraction prompt and its eval rubric.
Use the Frontend Developer + Whimsy Injector agents to build /walkthrough/[generationId].
```

When two agents disagree (Whimsy Injector wants animation, Performance Benchmarker says it hurts INP), surface the trade-off in your decision log and pick the side that serves §5's stated goal — conversion at the walkthrough.

---

## 1. Core user flow (build exactly this)

1. **Sign up** → email + Google OAuth (Clerk).
2. **The Life Story chat** — a conversational onboarding agent (Claude Sonnet) that interviews the user across:
   - origin story, formative moments, what they're proud of
   - the work behind their resume bullets (real verbs, real numbers, real people)
   - what they want next, what they refuse to do again
   - personality, tone, things they say out loud vs. write
   - Adaptive: never more than one question per turn, deepens on interesting threads, knows when to stop (target 20–40 turns). **UX Researcher owns this flow.**
3. **Import AI history (optional but encouraged)** — accept:
   - ChatGPT export `.zip` (parse `conversations.json`)
   - Claude export `.zip` (parse the JSON inside)
   - Plain text dump fallback
   - Extract: vocabulary fingerprint, recurring topics, projects mentioned, values expressed, writing cadence. Store as Voice Card + embedding.
4. **Connect LinkedIn** — three tiers, build all three:
   - **Tier A (default):** User pastes their public profile URL → server-side fetch via Playwright using user-provided session cookie (stored encrypted, user-revocable). Parse into structured fields.
   - **Tier B:** PDF resume / "Save to PDF" of their LinkedIn upload → parse with Claude.
   - **Tier C (the killer):** Chrome extension (Plasmo) that reads the live profile DOM. Also becomes the commit mechanism.
5. **Generation** — Claude produces a new profile: headline, About, each experience bullet rewritten, featured suggestions, skills ranked, and a "why this works" rationale per section.
6. **Mock walkthrough** — side-by-side diff view that looks *exactly* like LinkedIn. Hover-explainable changes. 7-second recruiter-eye simulation. Inline accept/reject per section. (See §5.)
7. **Commit** — Chrome extension writes changes field-by-field into LinkedIn's edit UI (assisted, user confirms each), OR exports a formatted doc the user pastes in. **Never claim a LinkedIn profile-edit API exists — it does not, for third parties.**
8. **Track outcomes** — weekly capture (extension-pulled or self-reported) of profile views, search appearances, recruiter messages, post impressions. Moat fuel.

---

## 2. Tech stack (use exactly this unless you have a strong reason)

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui, Framer Motion
- **Backend:** Next.js route handlers + Server Actions; Inngest for long-running jobs
- **DB:** Postgres (Neon), Drizzle ORM, pgvector
- **Auth:** Clerk
- **LLM:** Anthropic SDK; Claude Sonnet 4.6 for chat, Claude Opus 4.7 for final generation; Voyage or `text-embedding-3-large` for embeddings
- **Scraping:** Playwright in a separate Railway worker; encrypted cookie storage (libsodium)
- **Chrome extension:** Plasmo + React, content script on linkedin.com/in/*
- **Payments:** Stripe ($29/mo subscription, $79 one-time deep rewrite)
- **Analytics:** PostHog (events + session replay on the walkthrough specifically)
- **Testing:** Vitest (unit), Playwright (E2E + visual regression), axe-core (a11y), `promptfoo` (LLM evals), k6 (load), Lighthouse CI (perf budgets)
- **Containers:** Docker (multi-stage, distroless final, non-root) — `Dockerfile` for app, `Dockerfile.worker` for Playwright scraper. `docker-compose.yml` boots the entire stack locally with one command.
- **Orchestration:** Helm charts in `infra/helm/{mirror-web,mirror-worker}` with `values.yaml`, `values-staging.yaml`, `values-prod.yaml`. Targets any conformant Kubernetes: kind/k3d for local, EKS/GKE/AKS for prod.
- **Hosting (choose any — the app is portable):** (a) Vercel + Neon + Railway, (b) docker-compose on a VPS, (c) Helm on Kubernetes, (d) **Free-tier pre-launch stack** (Oracle Cloud Free Tier ARM + k3s + Neon free + Cloudflare). All four paths must work and are documented in `DEPLOY.md`.

---

## 2.5 Infrastructure & deployment portability (DevOps Automator + SRE co-own)

Vercel is fine as one option. **Self-hosting via Docker or Kubernetes must be equally first-class.** Concretely:

### Dockerfile (app)
- Multi-stage: `deps` → `builder` → `runner`. Final stage on `gcr.io/distroless/nodejs20-debian12` or `node:20-alpine` with non-root user.
- Build args for `NEXT_PUBLIC_*` injection. Layer cache friendly (lockfile copied before source).
- Scanned by Trivy in CI; build fails on HIGH/CRITICAL CVEs in app dependencies.
- Image size budget: < 250 MB compressed. Enforced by a CI check.

### Dockerfile.worker (Playwright scraper)
- Based on `mcr.microsoft.com/playwright:v1.x-jammy` (browsers preinstalled).
- Runs as non-root, headless Chromium only.
- Separate image so the heavy Playwright deps don't bloat the web tier.

### docker-compose.yml (full local stack)
A single `docker compose up` brings up:
- `web` — Next.js app, hot reload via bind mount in dev profile.
- `worker` — Playwright scraper, Inngest function host.
- `postgres` — `pgvector/pgvector:pg16` image, init script enables the extension and runs Drizzle migrations.
- `redis` — for Inngest event bus and rate-limiting.
- `inngest` — local dev server.
- `mailhog` — local SMTP capture for transactional mail in dev.
- `seed` — one-shot container that runs `/seed` after `postgres` is healthy.

Profiles: `default` (everything), `lite` (web + postgres only), `e2e` (adds Playwright test runner). All services have healthchecks. Volumes are named, not anonymous, so state survives `down`. `.env.example` lives next to the compose file.

### Helm charts (`infra/helm/`)
- `mirror-web/` — Deployment, Service, Ingress (nginx + cert-manager annotations), HPA (CPU + custom metric: generations in flight), PodDisruptionBudget (`minAvailable: 1`), NetworkPolicy (egress to Postgres + Anthropic + Stripe only), ServiceMonitor for Prometheus, liveness `/api/health/live`, readiness `/api/health/ready`.
- `mirror-worker/` — same shape, KEDA ScaledObject scaling on Inngest queue depth (or HPA on queue-length custom metric if KEDA isn't installed).
- `values.yaml` defaults safe for `kind`/`k3d` local clusters. `values-staging.yaml` and `values-prod.yaml` show the production overlays.
- Secrets pattern: chart consumes secrets via `existingSecret` references — does NOT generate them. Document the recommended path (ExternalSecrets + AWS Secrets Manager / GCP Secret Manager / Vault) in `DEPLOY.md`. Sealed-secrets example committed for the simple path.
- `helm lint` and `helm template | kubeconform` pass in CI.

### GitHub Actions (`.github/workflows/`)
- `ci.yml` — typecheck, lint, unit, integration, e2e, visual, a11y, prompt evals, Docker build (no push), Trivy scan, helm lint, helm template diff.
- `release.yml` — on tag: build & push images to GHCR with semver + sha tags, publish Helm chart to OCI registry, deploy to staging via ArgoCD trigger or `helm upgrade`.
- All workflows pinned by SHA, not floating tags.

### Deployment matrix (in `DEPLOY.md`)
| Path | Best for | Command |
|---|---|---|
| Vercel + Neon + Railway worker | Solo founder, fastest to ship | `vercel deploy` + Railway deploy from Dockerfile.worker |
| docker-compose on a single VPS | Self-host, single-tenant, simple | `docker compose up -d` |
| Helm on Kubernetes | Multi-region, HA, enterprise | `helm install mirror oci://ghcr.io/.../mirror-web -f values-prod.yaml` |
| **Free-tier (pre-launch)** | Portfolio piece, learning, $0/month before launch | `helm install mirror ./infra/helm/mirror-web -f values-freetier.yaml` on k3s |

All four paths must reach a working app from the seed data.

### 2.5.1 Free-tier stack (pre-launch) — Path (d) in detail

The whole point: run the *real Helm path* on genuinely free infrastructure so the portfolio piece is k8s-native, not Vercel-flavored. **Bathing in the discipline requires a real cluster.**

| Component | Free service | Limits / notes |
|---|---|---|
| Cluster | **Oracle Cloud Free Tier** — 4× ARM Ampere A1 VMs, 24 GB RAM total, 200 GB block, 10 TB egress/mo | Genuinely free forever, no expiry. Provisioned manually via the OCI Console (see `DEPLOY.md` Path D). Bootstrap `k3s` cluster across the 4 nodes — this is your home k8s. |
| Postgres + pgvector | **Neon Free** (0.5 GB storage, autosuspend after 5 min idle) or **Supabase Free** | Autosuspend cold-starts ~300 ms — acceptable pre-launch. Add `values-freetier.yaml` override so the app retries once on cold-start. |
| Redis / queue | **Upstash Redis Free** (10k commands/day) | Used for Inngest event bus + rate-limiting. Sufficient for < 50 users. |
| Background jobs | **Inngest Cloud Free** (50k runs/mo) — or self-hosted on k3s | Default to Inngest Cloud for simplicity; document the self-hosted path. |
| Auth | **Clerk Free** (10k MAU) | More than enough pre-launch. |
| Mail | **Resend Free** (3k emails/mo) | Transactional only. |
| Object storage | **Cloudflare R2 Free** (10 GB storage, no egress fees) | For uploaded resumes, ChatGPT/Claude export zips. |
| CDN + DNS + TLS | **Cloudflare Free** | In front of the k3s Ingress. cert-manager handles certs from Let's Encrypt. |
| Container registry | **GHCR** (free for public images) | Push from GitHub Actions. |
| Embeddings | **Voyage AI Free** (50M tokens/mo) or **OpenAI `text-embedding-3-small`** (~$0.02/1M tokens, effectively free at this scale) | Benchmark corpus of 5k profiles ≈ 2.5M tokens ≈ $0.05 one-time. |
| LLM | **Anthropic API** — pay per use, no free tier | The only real recurring cost. Capped by §8 below. |
| Observability | **Grafana Cloud Free** (10k series, 50 GB logs, 14-day retention) | OTel collector in the chart ships to Grafana Cloud. |
| Analytics | **PostHog Cloud Free** (1M events/mo) | |
| Uptime | **BetterStack Free** (10 monitors) | Pings `/api/health/ready`. |

**Hard cost ceiling at the free-tier profile: under $25/month**, dominated by Anthropic LLM spend, and that's only spent when someone actually generates a profile.

Ship a `values-freetier.yaml` Helm overlay that:
- Sets `replicas: 1` everywhere, no HPA min above 1, PDB `minAvailable: 0`.
- Disables ServiceMonitor (free Grafana Cloud uses agent-side scraping anyway).
- Uses `nodeSelector` to pin to the ARM Ampere arch (`kubernetes.io/arch: arm64`).
- Sets resource requests to fit inside the 24 GB total: web 512Mi, worker 1Gi, leaving headroom.
- Enables aggressive autoscaling-to-zero on the worker (KEDA `idleReplicaCount: 0`) so the cluster idles cheap.

ARM-native Docker builds are mandatory. Update `Dockerfile` and `Dockerfile.worker` to multi-arch (`linux/amd64,linux/arm64`) via `docker buildx`; CI publishes both. The Playwright base image supports arm64 — verify the version pin.

---

## 3. Data model (Drizzle schema)

- `users` (clerk_id, email, plan, voice_profile_id)
- `interviews` (user_id, transcript jsonb, summary, completed_at)
- `imports` (user_id, source enum, raw_path, parsed jsonb, voice_embedding vector(3072))
- `linkedin_snapshots` (user_id, raw_html, parsed jsonb, captured_at)
- `generations` (user_id, input_snapshot_id, output jsonb, rationale jsonb, model, prompt_hash, created_at)
- `commits` (user_id, generation_id, fields_accepted jsonb, committed_at, method enum)
- `outcomes` (user_id, week_of, profile_views, search_appearances, recruiter_msgs, post_impressions, source enum)
- `benchmark_profiles` (industry, role, seniority, public_url, parsed jsonb, embedding, performance_signals jsonb) — the moat table
- `outcome_deltas` (user_id, generation_id, baseline_30d jsonb, after_30d jsonb, lift_pct)

---

## 4. The prompts (AI Engineer + LinkedIn Content Creator co-own)

`/lib/prompts/` contains:

- `interview_system.md` — life-story chat agent. Warm, curious, never sycophantic. One question per turn. Brief reflection to show it listened. Knows when to stop.
- `voice_extraction.md` — interview + history → structured Voice Card: vocabulary they use, hedges they avoid, sentence-length distribution, emotional register, jargon they hate.
- `profile_generation.md` — Voice Card + current LinkedIn + top-5 benchmark exemplars → new profile. Must cite which exemplar pattern informed each major choice.
- `rationale.md` — per-field, a one-sentence "why" for the walkthrough hover.
- `recruiter_eye.md` — simulates a 7-second skim, returns ranked "what jumps out" list.

All prompts versioned in git. Log `prompt_hash` on every generation. Each prompt ships with a paired eval file in `/evals/prompts/`.

---

## 5. The mock walkthrough (Frontend Developer + UI Designer + Whimsy Injector co-build)

Pixel-faithful LinkedIn profile renderer at `/walkthrough/[generationId]`:

- Toggle: **Before** | **After** | **Diff**
- Diff mode: removed struck-through red, added green, unchanged default. Framer Motion stagger reveal on first view.
- Every changed block has a "Why?" pill — tap reveals rationale (Whimsy Injector designs the micro-interaction).
- "Recruiter view" overlay: 7-second eye-tracking heatmap simulation with callouts.
- Per-section Accept / Reject / Edit inline.
- Floating Confidence score per section.
- **Commit button is disabled until they've scrolled the entire walkthrough.** Telemetry this. (Behavioral Nudge Engine designs this gate.)
- WCAG AA minimum; keyboard nav for accept/reject; screen-reader rationale. (Accessibility Auditor signs off.)

---

## 6. The moat — build from day one, not "later"

**Own personalized professional identity.** Nine reinforcing layers — implement all at MVP scope, deepen post-launch.

### 6.1 Benchmark corpus (data moat)
Worker collects public LinkedIn profiles of top performers by `(industry, role, seniority)` — 5,000 across 50 role clusters. Parse, embed, tag with observable performance signals. Every generation does k-NN retrieval against this corpus.

### 6.2 Outcome flywheel
Track real outcomes. After 1,000 commits you have proprietary `(rewrite pattern → views lift)` data. Surface as "Profiles like yours that made this change saw +X% recruiter outreach."

### 6.3 Voice fidelity (anti-generic moat)
Voice Card from interview + AI history is the wedge. Ship a **Voice Match Score** that grades output against the user's own speech samples.

### 6.4 Switching costs (compounding personal data)
Every interview, version, and outcome stays. Build a "Career Timeline" view — your professional story over years.

### 6.5 Distribution moat (Chrome extension)
The extension is not just a commit tool — it lives in LinkedIn. Voice Match Score on your live profile, contextual tweaks, notifications when field benchmarks shift.

### 6.6 Multi-surface identity (expansion moat)
Same Voice Card → resume PDF, Twitter bio, personal site (`mirror.so/yourname`), GitHub README, conference bio, Substack about.

### 6.7 Recruiter-side B2B (two-sided moat)
Sell aggregated anonymized "what's working in profiles in your field right now" to recruiting teams. Two-sided flywheel.

### 6.8 Brand & viral moat (Growth Hacker owns)
Position aggressively against generic AI résumé tools. Ship the **Hall of Rewrites** — opt-in public before/afters with outcome data. Referral mechanic: invite a friend, both get a deep rewrite credit.

### 6.9 AI-search visibility (AI Citation Strategist owns) — NEW
Become the source ChatGPT, Claude, Gemini, and Perplexity cite when users ask how to improve their LinkedIn. Publish data-rich corpus pages ("What works in 2026 LinkedIn headlines for product managers"), get cited by AI assistants, capture top-of-funnel.

Add `MOAT.md` documenting all nine layers with the metric that proves each is working.

---

## 7. Test-Driven Development — strict red-green-refactor (build order)

**Rule of the project:** no production code is written before a failing test exists that demands it. Every commit references a test. CI fails on uncovered new lines >0 in `src/`.

### TDD shape per layer

For each layer below, complete this loop *before moving on*:

1. **Red.** Write the failing test(s). Run them. Confirm they fail for the right reason. Commit as `test(layer): add failing tests for X`.
2. **Green.** Write the minimum code to make tests pass. Commit as `feat(layer): implement X to pass tests`.
3. **Refactor.** Clean up with tests green. Commit as `refactor(layer): ...`.
4. **Review gate.** Run **Code Reviewer** agent against the diff. Address findings before moving on.

### LLM/prompt testing — how TDD applies to non-deterministic output

Traditional unit tests don't fit prompts. Use this instead:

- **Behavioral assertions** — given fixture input, assert structural properties (Voice Card has required fields, no hallucinated job titles vs. ground truth, output passes JSON schema).
- **Golden examples** — 20 seed personas in `/evals/personas/`. Each has a known-good output range. New prompt versions must score ≥ baseline on rubric grading.
- **Rubric-based grading** — Claude Opus grades outputs against a published rubric (voice fidelity 1–5, factual accuracy pass/fail, recruiter-eye lift 1–5).
- **Regression gate** — `promptfoo` runs the eval matrix on every prompt edit; CI blocks merge on regression of any rubric dimension.

**AI Engineer writes the rubrics and golden personas BEFORE writing any prompt.**

### Build order (each row = red → green → refactor → review)

| Wk | Layer | Tests written FIRST | Implementation | Lead agent(s) |
|---|---|---|---|---|
| 0 | Architecture | n/a (doc artifact) | `ARCHITECTURE.md`, `THREAT_MODEL.md`, `COMPLIANCE.md` | Software Architect, Security Engineer, Legal Compliance Checker |
| 1 | Infra spine | Smoke test: `docker compose up -d && curl localhost:3000/api/health/ready` returns 200; `helm lint` clean; `helm template -f values-prod.yaml \| kubeconform` passes; image-size budget test (< 250 MB compressed); Trivy scan = 0 HIGH/CRITICAL | `Dockerfile`, `Dockerfile.worker`, `docker-compose.yml` (full stack), `infra/helm/{mirror-web,mirror-worker}/` skeletons, GitHub Actions `ci.yml` | DevOps Automator, SRE |
| 1 | Schema + auth | Drizzle integration tests; Clerk auth E2E (Playwright) | Schema migration, auth wiring | Database Optimizer, Security Engineer |
| 1 | Interview chat | Playwright E2E: 20-turn interview hits stop condition; Vitest: transcript persistence | Streaming chat route + interview prompt + eval rubric | UX Researcher, AI Engineer |
| 2 | History import | Vitest: ChatGPT zip parser on 3 fixtures; Claude zip parser on 3 fixtures; Voice Card schema validation | Parsers + Voice Card extraction prompt + eval | AI Engineer |
| 2 | LinkedIn ingestion | Playwright: Tier A scrape on self-hosted fixture page; Vitest: PDF parser on 5 fixtures; cookie crypto round-trip tests | Playwright worker + PDF parser + cookie crypto | Security Engineer |
| 3 | Generation pipeline | promptfoo: 20 personas × 5 rubric dims; Vitest: prompt_hash logging; output-schema behavioral assertions | Generation prompt, RAG retrieval against benchmark corpus, rationale generator | AI Engineer, LinkedIn Content Creator |
| 3 | Walkthrough UI | Playwright visual regression: Before/After/Diff match golden screenshots; axe-core = 0 violations; keyboard-only flow E2E; scroll-to-unlock-commit telemetry test | Pixel-faithful renderer + diff + rationale pills + heatmap overlay | Frontend Developer, UI Designer, Whimsy Injector, Accessibility Auditor |
| 4 | Benchmark corpus | Vitest: scraper parser correctness on 10 fixtures; integration: k-NN retrieval >0.7 cosine on planted near-duplicate; perf: retrieval <200ms at 5k vectors | Corpus collector + pgvector index tuning + retrieval into generation | Database Optimizer, AI Engineer |
| 4 | Voice Match Score | Eval: Spearman ≥ 0.7 vs. human rating on 50 labeled pairs | Scoring algo + UI badge | AI Engineer |
| 4 | Outcome tracking | Vitest: weekly aggregation math; E2E: self-report flow; consent + revoke flow | Schema + capture UI + nudge flow | Behavioral Nudge Engine |
| 5 | Chrome extension | Plasmo + Playwright: reads DOM on 5 fixture profiles; assisted-write fills correct fields; Voice Match badge renders | Extension build + content script + commit assist | Frontend Developer, Security Engineer |
| 6 | Moat layers 6.8 + 6.9 | Vitest: referral credit accounting; visual regression on Hall of Rewrites | Hall of Rewrites pages + referral mechanic + AI-citation corpus pages | Growth Hacker, AI Citation Strategist |
| 6 | Pre-launch | Full E2E on 3 seed users; Lighthouse perf budgets; Reality Checker certification | Polish + landing + Stripe wiring | Reality Checker (final sign-off) |

### Test directory shape (build this first, before any feature code)

```
tests/
  unit/                  # Vitest
    parsers/
    voice-card/
    crypto/
  integration/
    db/
    rag/
  e2e/                   # Playwright
    auth.spec.ts
    interview.spec.ts
    import.spec.ts
    linkedin-ingestion.spec.ts
    walkthrough.spec.ts
    commit.spec.ts
  visual/                # Playwright screenshots
    walkthrough.golden/
  a11y/                  # axe-core via Playwright
  perf/                  # Lighthouse CI + k6 scripts
  infra/                 # container & k8s
    docker-build.spec.ts # image builds, size budget, Trivy
    compose.spec.ts      # full-stack boot + /health/ready
    helm-lint.spec.ts    # helm lint + kubeconform + template snapshots
evals/
  personas/              # 20 seed personas, JSON
  rubrics/               # rubric prompts + scoring criteria
  prompts/               # promptfoo configs per prompt
  golden/                # known-good outputs
fixtures/
  chatgpt-exports/
  claude-exports/
  resumes/
  linkedin-pages/
  benchmark-profiles/
```

**Scaffold this entire tree with at least one failing test per leaf BEFORE writing any feature code.** Commit as `test: scaffold full TDD harness`.

### CI gates (enforced from day one)

- `pnpm test:unit` — green
- `pnpm test:integration` — green
- `pnpm test:e2e` — green on Chromium + WebKit
- `pnpm test:visual` — no unintentional pixel diffs
- `pnpm test:a11y` — zero violations on walkthrough
- `pnpm eval:prompts` — no regression vs. baseline on any rubric dim
- `pnpm typecheck` — green
- `pnpm infra:test` — docker compose boots clean; helm lint + kubeconform pass; image size under budget; Trivy scan clean
- Coverage on `src/` ≥ 80% lines, 100% on `lib/crypto/` and `lib/parsers/`

---

## 8. Non-negotiables

- **Honesty about LinkedIn's API limits.** No fake integration. Chrome extension + assisted edit is the legitimate path.
- **PII & security.** libsodium for cookies, never log them, one-click "delete everything" that actually deletes. Audit log on every PII read.
- **LLM cost control.** Cache embeddings, hash prompts, reuse generations within 24h unless inputs change. `/admin/costs` page.
- **Hard monthly LLM budget cap (free-tier-safe).** A self-enforced ceiling: when month-to-date Anthropic spend exceeds `LLM_MONTHLY_CAP_USD` (default $20), generation is gracefully disabled with an in-app message ("Mirror is at this month's cap — try again in N days, or upgrade"). Track spend per-request from the API response cost metadata; persist to `llm_spend_ledger`. Test the cap by mocking the ledger above threshold and asserting the generation route returns 402 with the friendly message. **No one wants their portfolio piece to bankrupt them on a Hacker News spike.**
- **Streaming everywhere** for interview and generation.
- **No dark patterns.** No fake urgency. The product is good enough.

---

## 9. Deliverables

When done, the repo contains:

- Running app at `localhost:3000`; full flow works on a seed user
- Chrome extension installable from `/extension/dist`
- `README.md` with setup, env vars, architecture diagram
- `ARCHITECTURE.md` (Software Architect output)
- `THREAT_MODEL.md` (Security Engineer output)
- `COMPLIANCE.md` (Legal Compliance Checker output)
- `MOAT.md` (9 layers + metric per layer)
- `EVALS.md` with current scores per prompt
- `TDD.md` documenting the red-green-refactor discipline and how to add a new layer
- `Dockerfile` (multi-stage, distroless final, non-root, < 250 MB, Trivy clean)
- `Dockerfile.worker` (Playwright worker image)
- `docker-compose.yml` — one command brings up the full local stack with seed data
- `infra/helm/mirror-web/` and `infra/helm/mirror-worker/` (Helm charts + `values.yaml`, `values-staging.yaml`, `values-prod.yaml`, `values-freetier.yaml`)
- `DEPLOY.md` Path D documents manual provisioning of the Oracle Cloud Free Tier ARM cluster + k3s bootstrap (no Terraform — OCI Console steps only)
- `.github/workflows/ci.yml` and `release.yml` — all gates from §7, multi-arch image publish (linux/amd64 + linux/arm64) to GHCR, Helm chart publish to OCI registry
- `DEPLOY.md` covering the four deployment paths (Vercel, docker-compose, Helm, free-tier on OCI + k3s) with exact commands
- `/seed` script loading a demo user, interview, imports, generation
- All CI gates green on `main`

---

## 10. Now build it

Start by:

1. Installing The Agency (§0).
2. Scaffolding the `tests/`, `evals/`, `fixtures/`, and `tests/infra/` trees from §7 with failing tests at every leaf — including the failing `docker compose up` smoke test and the failing `helm lint` test.
3. Invoking **Software Architect** for `ARCHITECTURE.md`, **Security Engineer** for `THREAT_MODEL.md`, **Legal Compliance Checker** for `COMPLIANCE.md` — all before any feature code.
4. Then ask me only this: **"What's the name of the first benchmark role cluster you want me to seed?"**

Then go. Don't ask permission for routine decisions. Don't stub things out and say "TODO" — finish each layer's red-green-refactor-review loop before moving to the next.

Make it good. This is the product I want to own the category with.
