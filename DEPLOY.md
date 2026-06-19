# Mirror — Deployment Guide

> Setting up a local development environment instead? See **[SETUP.md](SETUP.md)**.
> This guide covers production deployment only.

Four first-class deployment paths. All four reach a working app from seed data.

| Path | Best for | One-line |
|---|---|---|
| [Vercel + Neon + Railway](#path-a-vercel--neon--railway-worker) | Solo founder, fastest to ship | `vercel deploy` + Railway from `Dockerfile.worker` |
| [docker-compose on VPS](#path-b-docker-compose-on-a-vps) | Self-host, single-tenant | `docker compose up -d` |
| [Helm on Kubernetes](#path-c-helm-on-kubernetes) | Multi-region, HA, enterprise | `helm install mirror oci://ghcr.io/.../mirror-web` |
| [Free-tier: OCI + k3s](#path-d-free-tier-oracle-cloud--k3s) | Portfolio piece, $0/month pre-launch | OCI Console + k3s + Helm |

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
- **k8s**: ExternalSecrets + AWS/GCP Secrets Manager (operator install + an `ExternalSecret` per managed secret). Or Sealed Secrets for a simpler path.
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

**Cluster add-ons** — every item below must be installed before running `helm install`. The chart will silently misbehave or fail to start if any are missing.

#### 1. nginx-ingress controller

Required by: `values-prod.yaml` `ingress.className: nginx` and all TLS annotations.

```bash
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=LoadBalancer

# Verify
kubectl get pods -n ingress-nginx
# Expect: ingress-nginx-controller-* Running
```

**What breaks if missing:** Ingress resources are created but no external IP is assigned. The app is unreachable from outside the cluster.

#### 2. cert-manager + letsencrypt-prod ClusterIssuer

Required by: `values-prod.yaml` annotation `cert-manager.io/cluster-issuer: letsencrypt-prod`. The chart does not create the ClusterIssuer — you must create it after installing cert-manager.

```bash
helm upgrade --install cert-manager cert-manager \
  --repo https://charts.jetstack.io \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

# Verify CRDs exist
kubectl get crd certificates.cert-manager.io

# Create the letsencrypt-prod ClusterIssuer (replace YOUR_EMAIL)
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: YOUR_EMAIL
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

# Verify ClusterIssuer is ready
kubectl get clusterissuer letsencrypt-prod
# READY should be True
```

**What breaks if missing:** TLS certificate provisioning fails silently. The Ingress is created but HTTPS returns a self-signed or missing cert. cert-manager annotation on the Ingress is ignored.

#### 3. Prometheus Operator + ServiceMonitor CRD

Required by: `values-prod.yaml` `serviceMonitor.enabled: true`. The chart creates a ServiceMonitor resource; if the CRD is absent, `helm install` fails with "no matches for kind ServiceMonitor".

```bash
helm upgrade --install kube-prometheus-stack kube-prometheus-stack \
  --repo https://prometheus-community.github.io/helm-charts \
  --namespace monitoring --create-namespace \
  --set grafana.enabled=false \
  --set alertmanager.enabled=false

# Verify CRD exists
kubectl get crd servicemonitors.monitoring.coreos.com
```

**What breaks if missing:** `helm install` / `helm upgrade` fails immediately with a CRD not found error.

#### 4. prometheus-adapter with custom metrics API (`generations_in_flight`)

Required by: `values-prod.yaml` `autoscaling.customMetric.enabled: true` (metric name: `generations_in_flight`). The HPA targets this custom metric via the custom metrics API served by prometheus-adapter.

```bash
helm upgrade --install prometheus-adapter prometheus-adapter \
  --repo https://prometheus-community.github.io/helm-charts \
  --namespace monitoring \
  --set prometheus.url=http://kube-prometheus-stack-prometheus.monitoring.svc \
  --set rules.custom[0].seriesQuery='generations_in_flight{namespace!="",pod!=""}' \
  --set rules.custom[0].resources.overrides.namespace.resource=namespace \
  --set rules.custom[0].resources.overrides.pod.resource=pod \
  --set rules.custom[0].name.matches='^(.*)$' \
  --set rules.custom[0].name.as='${1}' \
  --set rules.custom[0].metricsQuery='avg(<<.Series>>{<<.LabelMatchers>>})'

# Verify the custom metric is available
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1" | jq '.resources[] | select(.name | contains("generations_in_flight"))'
```

**What breaks if missing:** The HPA is created but stays in `Unknown` state because it cannot fetch the `generations_in_flight` metric. The deployment does not autoscale. No pods crash, but scale-out under load is silently broken.

#### 5. CNI that enforces NetworkPolicy

Required by: `values-prod.yaml` `networkPolicy.enabled: true`. k3s ships Flannel by default which does **not** enforce NetworkPolicy. You must replace or augment it with a CNI that does (Calico, Cilium, or Weave Net).

```bash
# Option A: Calico (most common on bare-metal / OCI k3s)
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml

# Verify
kubectl get pods -n kube-system -l k8s-app=calico-node
# All nodes should show Running

# Option B: Cilium (preferred for eBPF-based policy enforcement)
helm upgrade --install cilium cilium \
  --repo https://helm.cilium.io \
  --namespace kube-system \
  --set kubeProxyReplacement=strict

# Verify NetworkPolicy enforcement
kubectl get crd networkpolicies.networking.k8s.io 2>/dev/null || echo "Built-in — check CNI enforcement"
```

**What breaks if missing:** `networkPolicy.enabled: true` creates NetworkPolicy objects but they are not enforced. All pod-to-pod traffic flows unrestricted. This is a **security misconfiguration**, not a functional failure — the app starts and runs normally but is exposed to lateral movement within the cluster.

#### 6. KEDA + Inngest external scaler (mirror-worker only)

Required by: `infra/helm/mirror-worker/values-prod.yaml` `scaledObject.enabled: true`. KEDA must be installed and the Inngest external scaler must be reachable.

```bash
helm upgrade --install keda keda \
  --repo https://kedacore.github.io/charts \
  --namespace keda --create-namespace

# Verify CRD exists
kubectl get crd scaledobjects.keda.sh

# The Inngest external scaler runs as a sidecar or separate service.
# See infra/helm/mirror-worker/ values for inngest.queueDepthTarget config.
```

**What breaks if missing:** `helm install mirror-worker` fails with "no matches for kind ScaledObject" if `scaledObject.enabled: true`. With `scaledObject.enabled: false` (default), KEDA is not required and the worker uses a standard Deployment + HPA.

---

**Summary: required add-ons per overlay**

| Add-on | values-prod.yaml | values-freetier.yaml | values-staging.yaml |
|---|---|---|---|
| nginx-ingress | Required | Required | Required |
| cert-manager + ClusterIssuer | Required | Required | Required |
| Prometheus Operator | Required | Not required | Not required |
| prometheus-adapter | Required | Not required | Not required |
| NetworkPolicy-capable CNI | Required | Optional | Optional |
| KEDA (worker chart) | Required | Optional (scale-to-zero) | Not required |

---

- A running Kubernetes cluster (EKS/GKE/AKS/k3s) with the add-ons above installed
- `kubectl` access + `helm` 3.x
- `mirror-secrets` k8s Secret created (see Secrets pattern above)

### Image repository setup

`values.yaml` ships with `image.repository: ghcr.io/YOUR_ORG/mirror-web` (and `mirror-worker`). Before deploying:

1. **Replace `YOUR_ORG`** with your actual GitHub organisation name in any `--set` flag or values overlay:
   ```bash
   --set image.repository=ghcr.io/acme-corp/mirror-web
   ```
   Or edit `values-prod.yaml` directly (recommended for GitOps).

2. **Private GHCR images** — if the packages are private, create an imagePullSecret and reference it:
   ```bash
   # Create the pull secret once per namespace
   kubectl create secret docker-registry ghcr-pull-secret \
     --docker-server=ghcr.io \
     --docker-username=YOUR_GITHUB_USER \
     --docker-password=YOUR_GITHUB_PAT \
     --namespace mirror

   # Then pass it at install/upgrade time
   --set "imagePullSecrets[0].name=ghcr-pull-secret"
   ```
   Public images (the default for open-source mirrors) do not require a pull secret.

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

**DB migrations run automatically** via a Helm post-upgrade Job hook — you do not need to run the `kubectl run db-migrate` command manually. See [DB migration hook](#db-migration-hook) below.

---

## Staging deploy (manual)

The `release.yml` CI workflow builds and pushes images on every semver tag but does **not** automatically deploy to staging (the workflow step is a placeholder pending cluster credentials). After a release tag is pushed, trigger the staging upgrade manually:

```bash
# 1. Ensure kubectl is pointed at your staging cluster context
kubectl config use-context <your-staging-context>

# 2. Pull the latest chart from GHCR (replace VERSION with the release tag, e.g. 0.2.0)
helm registry login ghcr.io -u YOUR_GITHUB_USER -p YOUR_PAT

# 3. Upgrade mirror-web to staging
helm upgrade mirror-web oci://ghcr.io/YOUR_ORG/mirror-web \
  --version VERSION \
  -f infra/helm/mirror-web/values-staging.yaml \
  --set image.tag=VERSION \
  --namespace mirror

# 4. Upgrade mirror-worker to staging
helm upgrade mirror-worker oci://ghcr.io/YOUR_ORG/mirror-worker \
  --version VERSION \
  -f infra/helm/mirror-worker/values-freetier.yaml \
  --set image.tag=VERSION \
  --namespace mirror

# 5. Verify rollout
kubectl rollout status deployment/mirror-web -n mirror
kubectl rollout status deployment/mirror-worker -n mirror
```

The Helm post-upgrade Job hook runs `pnpm db:migrate` automatically after each `helm upgrade`. Watch it with:

```bash
kubectl get jobs -n mirror -w
kubectl logs job/mirror-web-db-migrate -n mirror
```

---

## DB migration hook

Migrations run automatically via a Helm `post-install,post-upgrade` Job — no manual `kubectl run` step required. The Job:
- Uses the same image as the web deployment
- Reads `DATABASE_URL` from the `existingSecret`
- Has `backoffLimit: 3` and `restartPolicy: OnFailure`
- Cleans up on success (`hook-delete-policy: before-hook-creation,hook-succeeded`)

To **disable** the hook (e.g. you want to run migrations manually before the deploy):

```bash
helm upgrade mirror-web ... --set migration.enabled=false
```

---

## Path D: Free-tier (Oracle Cloud + k3s)

> Run the real Helm path on genuinely free infrastructure. Under $25/month (Anthropic API only).
>
> **Note:** This path is provisioned manually — there is no Terraform in this repo for OCI. The steps below cover the full process from zero.

### Infrastructure provisioning (manual)

#### 1. Create 4 ARM Ampere A1 VMs on Oracle Cloud Free Tier

1. Sign in to the [Oracle Cloud Console](https://cloud.oracle.com).
2. Navigate to **Compute → Instances → Create Instance**.
3. Repeat for **4 VMs** with these settings each time:
   - **Shape**: VM.Standard.A1.Flex — 1 OCPU, 6 GB RAM (totals: 4 OCPU / 24 GB free-tier allowance)
   - **Image**: Ubuntu 22.04 (Canonical) — arm64
   - **Boot volume**: 50 GB (200 GB total across 4 nodes fits free-tier block storage)
   - **VCN / subnet**: place all 4 in the same VCN subnet so they can reach each other over private IPs
   - **SSH key**: paste your public key
4. In the VCN's **Security List**, open inbound TCP on:
   - 6443 (k3s API server)
   - 10250 (kubelet)
   - 8472/UDP (Flannel VXLAN)
   - 80, 443 (Ingress)
   - 22 (SSH)

#### 2. Bootstrap k3s on the first node (server)

```bash
# SSH to node-1 (replace <NODE1_IP> with its public IP)
ssh ubuntu@<NODE1_IP>

# Install k3s server (disables Traefik — we use nginx-ingress instead)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --disable traefik" sh -

# Retrieve the node join token (needed for worker nodes)
sudo cat /var/lib/rancher/k3s/server/node-token
# Copy this token for the next step

# Copy the kubeconfig to your local machine
sudo cat /etc/rancher/k3s/k3s.yaml
# On your local machine: save to ~/.kube/config, replace 127.0.0.1 with <NODE1_IP>
```

#### 3. Join the remaining 3 nodes as k3s agents

```bash
# Repeat on node-2, node-3, node-4 (replace placeholders)
ssh ubuntu@<NODE_IP>
curl -sfL https://get.k3s.io | K3S_URL=https://<NODE1_IP>:6443 K3S_TOKEN=<TOKEN_FROM_ABOVE> sh -
```

#### 4. Verify the cluster

```bash
# From your local machine (kubectl configured to the k3s cluster)
kubectl get nodes
# Expect 4 nodes in Ready state
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
