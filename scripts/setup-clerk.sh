#!/usr/bin/env bash
# One-time Clerk instance setup for the Mirror dev environment.
# Run once after creating/linking the Clerk app: pnpm setup:clerk
#
# Prerequisites:
#   clerk auth login   (authenticate the Clerk CLI)
#   clerk link         (link this repo to the Mirror Clerk app)
#
# What this does:
#   1. Enables email+password sign-in (required for E2E tests via clerk.signIn())
#   2. Creates the E2E test user and sets CLERK_TEST_USER_* GitHub secrets
#
# After running, also set these repo secrets from your Clerk dashboard API Keys page:
#   gh secret set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
#   gh secret set CLERK_SECRET_KEY

set -euo pipefail

echo "→ Enabling email+password sign-in strategy..."
clerk api /beta_features/instance_settings \
  -X PATCH \
  -d '{"email_address_sign_in_strategies": ["email_code", "email_password"]}' \
  --yes

echo "→ Creating E2E test user..."

# Use a fixed deterministic email so re-runs are idempotent.
E2E_EMAIL="e2e-test@mirror.dev"
E2E_PASSWORD="Mirror_E2E_Test_2026!"

# clerk users create is idempotent for the same email on the same instance
# (it will error if the user already exists — that's fine, ignore it).
clerk users create \
  --instance dev \
  --email "$E2E_EMAIL" \
  --password "$E2E_PASSWORD" \
  --first-name E2E \
  --last-name Test \
  --yes 2>/dev/null || echo "  (user already exists — skipping)"

echo "→ Writing CLERK_TEST_USER_* GitHub secrets..."
gh secret set CLERK_TEST_USER_EMAIL --body "$E2E_EMAIL"
gh secret set CLERK_TEST_USER_PASSWORD --body "$E2E_PASSWORD"

echo ""
echo "✓ Clerk setup complete."
echo ""
echo "Still needed (copy from https://dashboard.clerk.com → API Keys):"
echo "  gh secret set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
echo "  gh secret set CLERK_SECRET_KEY"
