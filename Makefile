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

helm-kubeconform:
	helm template mirror-web infra/helm/mirror-web \
		-f infra/helm/mirror-web/values-prod.yaml \
		| kubeconform -strict -ignore-missing-schemas -kubernetes-version 1.29.0
	helm template mirror-worker infra/helm/mirror-worker \
		-f infra/helm/mirror-worker/values-prod.yaml \
		| kubeconform -strict -ignore-missing-schemas -kubernetes-version 1.29.0

# Full local CI gate — matches the blocking checks in .github/workflows/ci.yml.
# Run this before pushing to avoid round-trip debugging.
ci: install typecheck lint test-unit test-integration build smoke
