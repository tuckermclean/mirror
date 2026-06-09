"use client"

/**
 * PostHog analytics provider.
 *
 * Security controls (per THREAT_MODEL.md §I-9):
 *   - session_recording.maskAllInputs: true  — prevents session replay from
 *     capturing PII in form fields
 *   - disable_session_recording: true — session replay off by default; enable
 *     only on explicitly consented pages
 *   - PII scrubbing via sanitize_properties removes fields named
 *     cookie/session/token/authorization before events are sent to PostHog
 *
 * CSP: the middleware already adds https://us.i.posthog.com and
 * https://app.posthog.com to connect-src.
 */

import * as React from "react"
import posthog, { type PostHogConfig } from "posthog-js"
import { PostHogProvider as PHProvider } from "posthog-js/react"

const PII_KEY_PATTERN = /cookie|session|token|authorization/i

/**
 * Exported so unit tests can assert the PII-safe configuration without
 * mounting the full component.
 */
export const POSTHOG_CONFIG: Partial<PostHogConfig> = {
  api_host: "https://us.i.posthog.com",
  ui_host: "https://us.posthog.com",
  disable_session_recording: true,
  session_recording: {
    maskAllInputs: true,
  },
  sanitize_properties(
    properties: Record<string, unknown>,
    _eventName: string
  ) {
    // Intentionally filters by PROPERTY KEY name only, not by value. This
    // catches the well-known PII-bearing keys (cookie/session/token/auth) the
    // app emits today. It does NOT inspect values, so it would not catch PII
    // smuggled under an innocuous key name (e.g. { note: "<a li_at cookie>" }).
    // That is acceptable for the current, small set of hand-written events.
    // Consideration for the future: as new events are added, re-evaluate
    // whether value-level scrubbing (regex on values) is warranted.
    return Object.fromEntries(
      Object.entries(properties).filter(([k]) => !PII_KEY_PATTERN.test(k))
    )
  },
}

let initialized = false

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ""

  React.useEffect(() => {
    if (!key || initialized) return
    posthog.init(key, POSTHOG_CONFIG)
    initialized = true
  }, [key])

  // Always wrap children in PHProvider so the posthog context is available
  // everywhere in the tree, regardless of whether a key is configured.
  //
  // Graceful no-op path: when NEXT_PUBLIC_POSTHOG_KEY is absent, the effect
  // above never calls posthog.init(). An uninitialized posthog client treats
  // capture()/identify() as safe no-ops, so telemetry simply degrades to
  // nothing instead of throwing — and feature code can call posthog.capture()
  // unconditionally without first checking whether analytics is enabled.
  return <PHProvider client={posthog}>{children}</PHProvider>
}
