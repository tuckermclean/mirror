#!/usr/bin/env bash
# Git prepare-commit-msg hook: strip Claude/Anthropic co-author attribution.
#
# Backstop to .claude/settings.json (includeCoAuthoredBy: false): removes
# any Claude/Anthropic co-author trailer and the "Generated with Claude Code"
# footer line so no agent attribution appears in committed history.
#
# Install as a local hook (one-time, per checkout):
#   bash scripts/git/strip-attribution.sh --install
#
# CI workflows that run agents install it at runtime with --install as well,
# so the hook fires on every commit the agent makes.
#
# When used as the hook itself (invoked by git with the commit-msg file path):
#   Called automatically by git — do not run directly.
set -uo pipefail

if [ "${1:-}" = "--install" ]; then
  git_hooks="$(git rev-parse --git-dir)/hooks"
  mkdir -p "$git_hooks"
  cp "$0" "$git_hooks/prepare-commit-msg"
  chmod +x "$git_hooks/prepare-commit-msg"
  echo "strip-attribution hook installed at $git_hooks/prepare-commit-msg"
  exit 0
fi

# Invoked by git: $1 is the commit message file path.
if [ -z "${1:-}" ]; then
  echo "usage: strip-attribution.sh <commit-msg-file>" >&2
  echo "       strip-attribution.sh --install" >&2
  exit 2
fi

# perl -i is portable across GNU/Linux and macOS (BSD sed -i requires an
# extension argument; GNU sed does not — using perl avoids the divergence).
perl -i -ne 'print unless
  /^Co-authored-by:.*[Aa]nthropic/ ||
  /^Co-authored-by:.*[Cc]laude/    ||
  /Generated with \[Claude Code\]/' \
  "$1"
