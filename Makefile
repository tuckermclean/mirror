.PHONY: install typecheck lint test-unit test-integration build smoke e2e eval-prompts helm-lint helm-kubeconform ci

install:
	pnpm install --frozen-lockfile

typecheck:
	pnpm typecheck

lint:
	pnpm lint

test-unit:
	pnpm test:unit

# Requires DATABASE_URL; skips automatically when absent via vitest it.skip guards.
test-integration:
	pnpm test:integration

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
