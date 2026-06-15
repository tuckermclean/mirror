# Chrome Extension — Security Posture (Week 5)

> Scope: the backend security surface for the Mirror Chrome extension's
> Voice Match Score endpoint (`POST /api/extension/voice-match`) and the
> trust boundaries the extension must respect. This document is consistent
> with `THREAT_MODEL.md §6 (Chrome Extension Security)` — that section is the
> source of truth; this doc summarizes the backend-relevant decisions and
> records the choices made for the voice-match endpoint. It does not modify
> the threat model.

Related spec: `SPEC.md §1.4 (Tier C distribution), §6.3 (Voice Match Score),
§6.5 (distribution moat)`.

---

## 1. Minimal manifest host permissions

The extension is scoped as tightly as the platform allows
(`THREAT_MODEL.md §6.6`):

- `host_permissions`: **`https://www.linkedin.com/in/*` only.** No
  `<all_urls>`, no broad `https://*/*`. The content script can only run on a
  LinkedIn profile page.
- `externally_connectable.matches`: **`https://mirror.so/*` only** — only the
  Mirror web app may message the extension via `chrome.runtime.sendMessage`.
- `content_scripts.matches`: `https://www.linkedin.com/in/*`, injected at
  `document_idle`, `world: ISOLATED` (LinkedIn's page JS cannot reach the
  content script's globals and vice-versa).
- CSP: `script-src 'self'; object-src 'none';` — no `unsafe-eval`, no remote
  code.

The content script additionally re-verifies the URL at runtime before adding
any listeners (`THREAT_MODEL.md §6.4`), so an open-redirect or history-API
trick on a `linkedin.com` page cannot smuggle it onto an unexpected context.

---

## 2. Trust boundary: content script ↔ background ↔ backend

Three components, three trust levels (`THREAT_MODEL.md §6.1–6.5`):

```
LinkedIn page (UNTRUSTED)
  │  DOM read / field write only — never sees the auth token
  ▼
Content script  (ISOLATED world, semi-trusted)
  │  chrome.runtime.sendMessage  — typed, schema-validated messages only
  ▼
Background service worker  (trusted; holds the auth token)
  │  fetch() with Bearer token, over HTTPS, to mirror.so
  ▼
Mirror backend  (trusted)  ──►  POST /api/extension/voice-match
```

Rules enforced at the boundary:

- The **content script never holds the Mirror auth token.** It cannot read
  `chrome.storage`; it asks the background worker to perform authenticated
  calls and receives back only the data it needs (e.g. a Voice Match Score),
  never the token (`THREAT_MODEL.md §6.2–6.3, §6.7`). Consequence: an XSS on
  the LinkedIn page cannot exfiltrate the token.
- The **background worker validates every inbound message**: `sender.id ===
  chrome.runtime.id`, `sender.url` starts with `https://www.linkedin.com/in/`,
  and the payload passes a Zod schema before dispatch (`THREAT_MODEL.md §6.5`).
- The **backend re-derives identity from the session/token, never from the
  message payload.** The voice-match route calls `auth()` and resolves the
  internal user id server-side (see §4). It trusts nothing the extension
  *claims* about who the user is — only what Clerk proves.

---

## 3. Why the extension never touches the `li_at` cookie

The LinkedIn session cookie (`li_at`) is the highest-value secret in the system
(`THREAT_MODEL.md §I-1`, Critical). Its handling is unchanged by the extension:

- `li_at` is **encrypted at rest** with libsodium `secretstream` and is
  decrypted **only inside the Playwright worker, in memory, for the duration of
  a single scrape** (`AGENTS.md` — Session cookie rule). It is never logged,
  never returned to a client, never written to disk.
- The Chrome extension is a **separate, client-side surface** and has **no path
  to `li_at`**: it does not read it, store it, transmit it, or even know it
  exists. Scraping stays server-side in the worker; the extension reads the
  live LinkedIn DOM directly in the user's own authenticated browser tab, which
  needs no Mirror-held cookie.
- Keeping `li_at` exclusively server-side means a compromised extension (or a
  malicious page achieving XSS in the content script) cannot reach the LinkedIn
  session cookie — there is simply no `li_at` on the client side of this
  boundary to steal.

The voice-match endpoint touches **no** `li_at` and **no** LinkedIn cookie of
any kind. It operates only on (a) the user's already-persisted voice embedding
and (b) the ad-hoc `profileText` the extension posts.

---

## 4. Auth flow for `POST /api/extension/voice-match`

Authentication reuses the user's existing **Clerk** session — there is no
separate extension credential class on the backend (`THREAT_MODEL.md §6.2`):

1. The user signs into Mirror in a normal tab; Clerk holds the session.
2. The extension popup obtains a short-lived (1-hour), `scope: extension` JWT
   via a Clerk-authenticated flow and stores it in `chrome.storage.session`
   (cleared on browser close, never `chrome.storage.local`).
3. The background worker attaches that JWT as a `Bearer` token (or relies on
   the Clerk session cookie for same-site calls) on the request to
   `/api/extension/voice-match`. Clerk's `auth()` accepts either path.

Server-side handling, in order (mirrors `api/commit` and `api/outcomes`):

1. **`const { userId } = await auth()` is the FIRST line.** `!userId` → `401
   { error: "unauthorized" }`. No DB access, no scoring happens first
   (`AGENTS.md` auth-first rule).
2. Parse the body; require a non-empty `profileText: string`. Bad/empty/
   non-string body or malformed JSON → `400`.
3. Resolve the internal user via `resolveActiveUserId` (tombstone-excluded,
   ADR-009). No row → `404 { error: "user_not_found" }`. **UUIDs are never
   treated as access credentials** — identity comes from the session, and the
   voice profile is loaded `WHERE users.id = <resolved id>`, so one user can
   never score against another's voice (IDOR-safe).
4. Load the user's persisted voice embedding + voice card and embed the
   candidate text; return `200 { score, components: { cosine, feature } }`.
   No persisted voice profile → `409 { error: "missing_voice_embedding" }`.

PII handling: the voice card is derived from `imports.parsed`, a gated PII
column, so it is read through `src/lib/db/pii-read.ts` (`readImportParsed`),
which audit-logs the access and fails closed if the audit write fails. The
candidate `profileText` is embedded **once, in memory, and never persisted**
(it is not a stored row, so the embedding-cache rule does not apply). Scoring
is pure and deterministic — **no Anthropic generation call**, so the LLM
monthly-cap (HTTP 402) path is not involved.

---

## 5. CORS posture

The endpoint is called cross-origin from the extension's background worker,
whose `Origin` is `chrome-extension://<id>`. The posture is fail-closed and
**never uses a wildcard**:

- **No `Access-Control-Allow-Origin: *`.** A wildcard is incompatible with
  `Access-Control-Allow-Credentials: true` (the browser refuses to send the
  Clerk cookie / Bearer token to a wildcard origin) and would let any site or
  extension read authenticated responses.
- The response **reflects the request `Origin` only when it is on the
  allow-list** (`src/lib/extension/cors.ts`). The allow-list is configured via
  the `EXTENSION_ALLOWED_ORIGINS` env var (comma-separated
  `chrome-extension://…` origins) so the dev unpacked id and the published Web
  Store id can differ per environment without code changes. Reflection locks
  each response to exactly one origin.
- **Fail-closed default:** with no allow-list configured, production accepts
  no cross-origin caller at all; outside production a well-formed
  `chrome-extension://<32-char-id>` origin is accepted to ease local
  development. A non-extension origin (e.g. `https://evil.example.com`) gets
  **no `Access-Control-Allow-Origin` header**, so the browser blocks any
  cross-origin read.
- `OPTIONS` preflight returns `204` with the same locked headers; allowed
  methods are `POST, OPTIONS` and allowed headers `Content-Type, Authorization`.
- `Vary: Origin` is set so caches never serve one origin's CORS decision to
  another.

CORS is a browser-enforced read guard, not the authorization mechanism:
authorization is always the server-side Clerk check in §4. Even if a caller
bypassed CORS (e.g. a non-browser client), it would still need a valid Clerk
session to get anything but a `401`.
