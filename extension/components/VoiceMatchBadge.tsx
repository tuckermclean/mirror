/**
 * VoiceMatchBadge — presentational layer.
 *
 * This file is intentionally dependency-light (React only): a pure
 * state→copy mapper (`voiceMatchView`) and a static renderer
 * (`VoiceMatchBadgeView`). The live, network-connected, Framer-Motion-animated
 * badge that mounts on the LinkedIn page lives in `VoiceMatchBadge.live.tsx`,
 * which composes this view. Keeping the view pure makes it unit-testable in the
 * repo's node Vitest environment without a DOM or animation runtime.
 */
import React from "react";

/** All states the badge can be in, driven by the typed API client. */
export type VoiceMatchState =
  | { status: "loading" }
  | { status: "ok"; score: number; components: { cosine: number; feature: number } }
  | { status: "error"; code: 400 | 401 | 402 | 404 | 409 | 422 | "network" };

export type ViewTone = "loading" | "score" | "info" | "error";

export interface VoiceMatchViewModel {
  tone: ViewTone;
  headline: string;
  body: string;
  /** Present only when tone === "score". */
  scoreLabel?: string;
}

const HEADLINE = "Voice Match";

/** Map an API state to the copy shown in the badge. Pure, fully testable. */
export function voiceMatchView(state: VoiceMatchState): VoiceMatchViewModel {
  if (state.status === "loading") {
    return { tone: "loading", headline: HEADLINE, body: "Checking your voice match…" };
  }
  if (state.status === "ok") {
    return {
      tone: "score",
      headline: `${HEADLINE} Score`,
      body: "How closely this profile sounds like you.",
      scoreLabel: String(Math.round(state.score)),
    };
  }
  return errorView(state.code);
}

type VoiceMatchErrorCode = 400 | 401 | 402 | 404 | 409 | 422 | "network";

function errorView(code: VoiceMatchErrorCode): VoiceMatchViewModel {
  switch (code) {
    case 401:
      return { tone: "info", headline: HEADLINE, body: "Sign in to Mirror to see your Voice Match Score." };
    case 402:
      return { tone: "info", headline: HEADLINE, body: "Mirror is at this month's cap — try again next month." };
    case 409:
      return { tone: "info", headline: HEADLINE, body: "Complete your interview to see your Voice Match Score." };
    case 404:
      return { tone: "info", headline: HEADLINE, body: "No Mirror account yet — sign up to get your Voice Match Score." };
    case 422:
      return { tone: "error", headline: HEADLINE, body: "This profile is too large to analyse — try a shorter one." };
    case 400:
      return { tone: "error", headline: HEADLINE, body: "We couldn't read this profile. Try again." };
    case "network":
    default:
      return { tone: "error", headline: HEADLINE, body: "Couldn't reach Mirror — check your connection and try again." };
  }
}

function toneColor(tone: ViewTone): string {
  switch (tone) {
    case "score":
      return "#057642"; // LinkedIn green
    case "error":
      return "#b24020";
    case "info":
      return "#0a66c2"; // LinkedIn blue
    case "loading":
    default:
      return "#666666";
  }
}

/** Static (non-animated) badge renderer. Used by the live wrapper and by tests. */
export function VoiceMatchBadgeView({ state }: { state: VoiceMatchState }): React.ReactElement {
  const view = voiceMatchView(state);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${view.headline}: ${view.scoreLabel ?? view.body}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "12px 16px",
        borderRadius: 12,
        background: "#ffffff",
        boxShadow: "0 2px 8px rgba(0,0,0,.18)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: 280,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,.6)" }}>
        {view.headline}
      </span>
      {view.scoreLabel ? (
        <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: toneColor(view.tone) }}>
          {view.scoreLabel}
          <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(0,0,0,.5)" }}>/100</span>
        </span>
      ) : null}
      <span style={{ fontSize: 13, color: "rgba(0,0,0,.7)" }}>{view.body}</span>
    </div>
  );
}
