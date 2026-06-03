.PHONY: install typecheck lint test-unit test-integration build smoke e2e eval-prompts helm-lint helm-kubeconform ci

install:
	pnpm install --frozen-lockfile

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test-unit:
	pnpm test:unit

# Runs db + health suites. Requires DATABASE_URL pointing at a migrated postgres+pgvector instance.
# rag/retrieval excluded — that module is not yet implemented (RED tests stay out of CI gate).
test-integration:
	pnpm vitest run tests/integration/db tests/integration/health

build:
	pnpm build

# Secrets-free standalone boot test: builds must exist (.next/standalone).
# Run `make build` first if .next is absent.
smoke:
	bash scripts/smoke.sh

e2e:
	pnpm test:e2e

eval-prompts:
	pnpm eval:prompts

helm-lint:
	helm lint infra/helm/mirror-web
	helm lint infra/helm/mirror-worker

db-push:
	pnpm drizzle-kit push --force

# CRDs (cert-manager, external-secrets, etc.) lack upstream schemas — suppress noise.
# CRDs in these charts: keda.sh/ScaledObject (mirror-worker), monitoring.coreos.com/ServiceMonitor (mirror-web).
# The datreeio CRDs-catalog supplies JSON schemas for both so kubeconform validates them properly.
# --ignore-missing-schemas is kept as a safety net for any CRD not yet in the catalog.
KUBECONFORM_FLAGS := -strict -kubernetes-version 1.29.0 \
	-schema-location default \
	-schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
	-ignore-missing-schemas

helm-kubeconform:
	helm template mirror-web infra/helm/mirror-web \
		-f infra/helm/mirror-web/values-prod.yaml \
		| kubeconform $(KUBECONFORM_FLAGS)
	helm template mirror-worker infra/helm/mirror-worker \
		-f infra/helm/mirror-worker/values-prod.yaml \
		| kubeconform $(KUBECONFORM_FLAGS)

playwright-install:
	pnpm exec playwright install --with-deps

# Wk 1 scope only: runs until all e2e specs are stable.
e2e-ci:
	pnpm exec playwright test tests/e2e/auth.spec.ts tests/e2e/interview.spec.ts

# For CI steps that run on untrusted code — skips postinstall hooks.
install-no-scripts:
	pnpm install --frozen-lockfile --ignore-scripts

# Full local CI gate — matches the blocking checks in .github/workflows/ci.yml.
# Run this before pushing to avoid round-trip debugging.
ci: install typecheck lint test-unit test-integration build smoke
