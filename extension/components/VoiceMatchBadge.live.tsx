/**
 * VoiceMatchBadge.live — the network-connected, animated badge mounted on the
 * live LinkedIn profile. Composes the pure `VoiceMatchBadgeView` and adds:
 *   - a fetch of the Voice Match Score from the backend via the typed client
 *   - a Framer Motion entrance animation (project standard for user-facing motion)
 *
 * This file is NOT imported by the unit tests (which exercise the pure view in
 * `VoiceMatchBadge.tsx`); it depends on `framer-motion` and `fetch`.
 */
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getVoiceMatch } from "../lib/api";
import { logger } from "../lib/logger";
import { VoiceMatchBadgeView, type VoiceMatchState } from "./VoiceMatchBadge";

export interface VoiceMatchBadgeProps {
  /** Concatenated headline + about + experience text from the DOM reader. */
  profileText: string;
}

/** Fetch the score once and animate the badge into view. */
export function VoiceMatchBadge({ profileText }: VoiceMatchBadgeProps): React.ReactElement {
  const [state, setState] = useState<VoiceMatchState>({ status: "loading" });

  useEffect(() => {
    // Cancellation uses a plain boolean flag rather than an AbortController:
    // on unmount we suppress the setState (avoiding a "state update on an
    // unmounted component" warning) but intentionally let the in-flight fetch
    // run to completion. The Voice Match badge is a non-critical, read-only
    // enrichment, so the extra plumbing of threading an AbortSignal through the
    // typed API client isn't worth it — the resolved response is simply
    // discarded when `cancelled` is true.
    let cancelled = false;
    async function load(): Promise<void> {
      const result = await getVoiceMatch(profileText);
      if (cancelled) return;
      if (result.ok) {
        setState({ status: "ok", score: result.data.score, components: result.data.components });
      } else {
        if (result.code === "network") {
          logger.warn("voice-match request failed", { error: result.error });
        } else {
          logger.warn("voice-match-badge", { code: result.code });
        }
        setState({ status: "error", code: result.code });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profileText]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2147483647 }}
      >
        <VoiceMatchBadgeView state={state} />
      </motion.div>
    </AnimatePresence>
  );
}

export default VoiceMatchBadge;
