.PHONY: install typecheck lint test-unit test-extension test-integration coverage build smoke e2e eval-prompts eval-spearman helm-lint helm-kubeconform ci db-push playwright-install e2e-ci install-no-scripts audit-workflows

install:
	pnpm install --frozen-lockfile

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test-unit:
	pnpm test:unit; E1=$$?; pnpm eval:spearman; E2=$$?; exit $$((E1 | E2))

# Self-contained Plasmo Chrome extension vitest suite (extension/ has its own deps).
# Installs the extension package first, then runs its 36 tests. Kept independent of
# test-unit so a root-only run stays fast and the extension install stays isolated.
test-extension:
	pnpm test:extension

# Runs db + health + rag suites. Requires DATABASE_URL pointing at a migrated postgres+pgvector instance.
test-integration:
	pnpm vitest run tests/integration/db tests/integration/health tests/integration/rag

coverage:
	pnpm coverage

build:
	pnpm build

# Secrets-free standalone boot test: builds must exist (.next/standalone).
# Run `make build` first if .next is absent.
smoke:
	bash scripts/smoke.sh

e2e:
	pnpm test:e2e

eval-prompts:
	bash scripts/eval-prompts.sh

eval-spearman:
	pnpm eval:spearman

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

# Audit PR-triggered workflows for unsafe working-tree script execution.
# See scripts/ci/check-pr-workflow-script-staging.sh for details.
audit-workflows:
	bash scripts/ci/check-pr-workflow-script-staging.sh

# Local pre-push gate: covers typecheck, lint, integration tests, build, and smoke.
# Intentional differences from ci.yml's blocking set:
#   - test-unit runs here (blocking) but is continue-on-error in CI (intentionally-RED suites)
#   - Docker build, Helm lint, and Helm kubeconform require local tooling; run `make helm-lint`
#     and `make helm-kubeconform` separately if you have the tools installed.
# Run this before pushing to catch the common failure modes without a CI round-trip.
ci: install typecheck lint test-unit test-extension test-integration build smoke
