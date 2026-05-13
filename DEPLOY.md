# Mirror — Deployment Guide

Four first-class deployment paths. All four reach a working app from seed data.

| Path | Best for | One-line |
|---|---|---|
| [Vercel + Neon + Railway](#path-a-vercel--neon--railway-worker) | Solo founder, fastest to ship | `vercel deploy` + Railway from `Dockerfile.worker` |
| [docker-compose on VPS](#path-b-docker-compose-on-a-vps) | Self-host, single-tenant | `docker compose up -d` |
| [Helm on Kubernetes](#path-c-helm-on-kubernetes) | Multi-region, HA, enterprise | `helm install mirror oci://ghcr.io/.../mirror-web` |
| [Free-tier: OCI + k3s](#path-d-free-tier-oracle-cloud--k3s) | Portfolio piece, $0/month pre-launch | Terraform + k3s + Helm |

---

## Secrets pattern (all paths)

The Helm charts and compose file consume secrets via `existingSecret` references — they **never generate secrets**. Provision them first:

```bash
# Generate COOKIE_ENCRYPTION_KEY (32 bytes, base64)
openssl rand -base64 32

# For Helm: create the k8s Secret before installing the chart
kubectl create secret generic mirror-secrets \
  --from-literal=DATABASE_URL="..." \
  --from-literal=ANTHROPIC_API_KEY="..." \
  # ... all vars from README.md

# For docker-compose: fill in .env.local (copy from .env.example)
cp .env.example .env.local
```

Recommended secret management:
- **k8s**: ExternalSecrets + AWS/GCP Secrets Manager (documented in `infra/terraform/`). Or Sealed Secrets for a simpler path.
- **VPS**: `.env.local` with restricted file permissions (`chmod 600`).
- **Vercel**: Environment variables in project settings.

---

## Path A: Vercel + Neon + Railway worker

> Fastest to revenue. Playwright worker **cannot** run on Vercel serverless — Railway is mandatory.

### Prerequisites
- Vercel account + `vercel` CLI
- Neon free project (or paid) — `DATABASE_URL`
- Railway account for the worker
- Upstash Redis — `REDIS_URL`
- All env vars from README.md

### Steps

```bash
# 1. Deploy the web app
vercel deploy --prod

# 2. Deploy the worker to Railway
# In Railway dashboard: New project → Deploy from GitHub → select repo
# Set root directory to repo root, Dockerfile to Dockerfile.worker
# Set all env vars in Railway dashboard

# 3. Run database migrations
DATABASE_URL="..." pnpm db:push

# 4. Seed demo data
DATABASE_URL="..." node scripts/seed.js
```

**Key constraint:** Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to match between Vercel and Railway.

---

## Path B: docker-compose on a VPS

> Self-hosted, single-tenant, privacy-first. One server handles everything.

### Prerequisites
- VPS with Docker + Docker Compose v2 (Ubuntu 22.04 recommended)
- DNS A record pointing to the VPS IP
- `.env.local` filled in

### Steps

```bash
# On the VPS
git clone https://github.com/YOUR_ORG/mirror.git && cd mirror
cp .env.example .env.local
# Fill in .env.local

docker compose up -d --wait
# App: http://<your-server>:3000

# With TLS (Caddy reverse proxy recommended):
# Add Caddy as a service in docker-compose or run it separately
# Caddy automatically provisions Let's Encrypt certs
```

**Upgrade path:**
```bash
docker compose pull
docker compose up -d --wait
```

---

## Path C: Helm on Kubernetes

> Multi-region, HA, enterprise scale. Targets any conformant k8s cluster.

### Prerequisites
- A running Kubernetes cluster (EKS/GKE/AKS/k3s)
- `kubectl` access + `helm` 3.x
- cert-manager installed for TLS
- nginx ingress controller
- `mirror-secrets` k8s Secret created (see Secrets pattern above)

### Steps

```bash
# Add GHCR Helm repo
helm registry login ghcr.io -u YOUR_GITHUB_USER -p YOUR_PAT

# Install mirror-web
helm install mirror-web oci://ghcr.io/YOUR_ORG/mirror-web \
  --version 0.1.0 \
  -f infra/helm/mirror-web/values-prod.yaml \
  --set ingress.hosts[0].host=mirror.yourdomain.com \
  --namespace mirror --create-namespace

# Install mirror-worker
helm install mirror-worker oci://ghcr.io/YOUR_ORG/mirror-worker \
  --version 0.1.0 \
  -f infra/helm/mirror-worker/values-prod.yaml \
  --namespace mirror

# Run migrations (one-off Job)
kubectl run db-migrate --image=ghcr.io/YOUR_ORG/mirror-web:latest \
  --restart=Never --rm -it \
  --env="DATABASE_URL=$(kubectl get secret mirror-secrets -o jsonpath='{.data.DATABASE_URL}' | base64 -d)" \
  -- pnpm db:migrate
```

**ArgoCD / GitOps path:**
Point ArgoCD at `infra/helm/mirror-web` and `infra/helm/mirror-worker` with the appropriate values overlay. Releases are triggered by pushing a semver tag — CI builds and pushes both images + the chart, then ArgoCD syncs automatically.

---

## Path D: Free-tier (Oracle Cloud + k3s)

> Run the real Helm path on genuinely free infrastructure. Under $25/month (Anthropic API only).

### Infrastructure provisioning

```bash
# Provision 4x ARM Ampere A1 VMs on Oracle Cloud Free Tier
cd infra/terraform/oci
cp terraform.tfvars.example terraform.tfvars
# Fill in OCI credentials
terraform init && terraform apply

# Bootstrap k3s cluster across the 4 nodes
# (Terraform output includes the k3s install commands)
# SSH to the first node and run:
curl -sfL https://get.k3s.io | sh -
# On remaining nodes, join the cluster with the token from /var/lib/rancher/k3s/server/node-token
```

### Install the chart (free-tier profile)

```bash
# From your local machine (kubectl configured to the k3s cluster)
helm install mirror-web ./infra/helm/mirror-web \
  -f infra/helm/mirror-web/values-freetier.yaml \
  --set ingress.enabled=true \
  --set "ingress.hosts[0].host=mirror.yourdomain.com" \
  --namespace mirror --create-namespace

helm install mirror-worker ./infra/helm/mirror-worker \
  -f infra/helm/mirror-worker/values-freetier.yaml \
  --namespace mirror
```

### Free-tier service map

| Component | Service | Limit |
|---|---|---|
| Cluster | Oracle Cloud Free Tier (4x ARM, 24 GB, 200 GB block) | Genuinely free forever |
| Postgres + pgvector | Neon Free (0.5 GB, autosuspend 5 min) | Cold-start ~300ms — app retries once |
| Redis | Upstash Free (10k commands/day) | Sufficient for < 50 users |
| Background jobs | Inngest Cloud Free (50k runs/mo) | Self-hosted path documented in `infra/helm/` |
| Auth | Clerk Free (10k MAU) | More than enough pre-launch |
| Mail | Resend Free (3k emails/mo) | Transactional only |
| Object storage | Cloudflare R2 Free (10 GB, no egress fees) | Uploads + raw HTML |
| CDN + DNS + TLS | Cloudflare Free | In front of k3s Ingress |
| Container registry | GHCR (free for public images) | |
| Observability | Grafana Cloud Free (10k series, 50 GB logs) | OTel collector in chart |
| Analytics | PostHog Cloud Free (1M events/mo) | |
| LLM | Anthropic API (pay per use) | Only real cost; capped by `LLM_MONTHLY_CAP_USD` |

**Hard cost ceiling: under $25/month**, dominated by Anthropic spend — and that's only when users actually generate profiles.

---

## Neon cold-start handling (free tier)

Neon free tier autosuspends after 5 minutes of inactivity. The app handles this with a single retry in the DB client:

```typescript
// src/db/client.ts already handles this via postgres.js retry config
// If you see connection errors on first request after idle, check DATABASE_URL
// includes ?connect_timeout=10 or similar
```

The `values-freetier.yaml` sets `app.neonColdStartRetry: true` which enables the retry middleware.
