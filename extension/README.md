# Mirror — Chrome Extension (Plasmo)

The Tier C surface from `SPEC.md` §1.4: a Plasmo + React extension that lives on
your live LinkedIn profile. It is self-contained — its own `package.json`,
`tsconfig.json`, and lockfile — and does **not** share dependencies with the
root Mirror app.

## What it does

- **Reads** your live LinkedIn profile DOM into structured fields
  (`lib/dom-reader.ts`) — pure, unit-tested against 5 fixture profiles.
- **Shows** a floating **Voice Match** badge (`components/VoiceMatchBadge.tsx`)
  with your Voice Match Score, fetched from the backend via the typed client
  (`lib/api.ts`). Every non-200 case renders a calm, specific fallback.
- **Assists** profile edits **field-by-field** (`lib/assisted-write.ts`):
  it fills LinkedIn's own edit inputs only after you confirm each field, and
  **never auto-submits**.

## Honesty (SPEC §8)

There is **no third-party LinkedIn profile-edit API**. Assisted DOM fill with
explicit per-field user confirmation is the only legitimate commit path, and it
is exactly what `lib/assisted-write.ts` does. Nothing here claims otherwise.

## Permissions

Scoped to the minimum: `host_permissions` is `https://www.linkedin.com/in/*`
only, plus `storage`. The content script matches the same `/in/*` URL.

## Develop

```bash
cd extension
pnpm install
pnpm dev      # plasmo dev — load build/chrome-mv3-dev as an unpacked extension
pnpm build    # production build → build/chrome-mv3-prod
```

Set the backend base URL at build time:

```bash
PLASMO_PUBLIC_API_BASE="https://app.mirror.example" pnpm build
```

Default is `http://localhost:3000`.

## Tests

Unit tests live in the repo root under `tests/unit/extension/**` and run with the
root `pnpm test:unit`. They import the extension's pure modules directly and use
`happy-dom` (an extension devDependency) to parse fixture HTML, so the root
package.json and lockfile stay untouched.
