/**
 * Content script — runs on LinkedIn profile pages (`/in/*` only).
 *
 * Responsibilities:
 *   1. Read the live profile DOM into structured fields (pure dom-reader).
 *   2. Concatenate them into the `profileText` blob the backend expects.
 *   3. Mount the floating Voice Match badge.
 *
 * Host permissions are scoped to `https://www.linkedin.com/in/*` in the
 * manifest — the extension never touches any other page. We do NOT edit the
 * profile here: assisted writes happen only through `lib/assisted-write`, which
 * requires explicit per-field user confirmation and never auto-submits.
 *
 * SPA navigation: LinkedIn uses the History API for client-side navigation.
 * Plasmo does NOT re-inject content scripts on popstate/pushState. We set up
 * listeners for both `popstate` and a monkey-patched `pushState`/`replaceState`
 * so that navigating from `/in/alice` to `/in/bob` re-reads the profile and
 * resets the badge.
 */
import type { ReactElement } from "react";
import { useState, useEffect } from "react";
import type { PlasmoCSConfig, PlasmoGetInlineAnchor } from "plasmo";
import { readProfile, profileToText } from "../lib/dom-reader";
import { VoiceMatchBadge } from "../components/VoiceMatchBadge.live";

export const config: PlasmoCSConfig = {
  matches: ["https://www.linkedin.com/in/*"],
  all_frames: false,
};

// Render the badge as an overlay anchored to the document body. Plasmo injects
// it into a Shadow DOM so LinkedIn's styles don't leak into the badge.
// Content scripts always run in a browser context — document is always defined.
export const getInlineAnchor: PlasmoGetInlineAnchor = () => document.body;

/** Read the current page's profile text, or null if not a profile page. */
function readCurrentProfileText(): string | null {
  const profile = readProfile(document);
  const text = profileToText(profile);
  return text || null;
}

export default function LinkedInProfileOverlay(): ReactElement | null {
  const [profileText, setProfileText] = useState<string | null>(
    readCurrentProfileText,
  );

  useEffect(() => {
    // Track the pending re-read timer so we can cancel it on unmount.
    const timerId: { current: ReturnType<typeof setTimeout> | undefined } = {
      current: undefined,
    };

    /** Re-read the profile after a small delay so the SPA DOM settles. */
    function handleUrlChange(): void {
      // Only act on /in/* paths.
      if (!/^\/in\//.test(window.location.pathname)) return;
      // Give the SPA a tick to render the new profile content.
      timerId.current = setTimeout(() => {
        setProfileText(readCurrentProfileText());
      }, 500);
    }

    // Intercept History API pushState / replaceState (LinkedIn's SPA uses both).
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function patchedPushState(
      ...args: Parameters<typeof history.pushState>
    ): void {
      originalPushState(...args);
      handleUrlChange();
    };

    history.replaceState = function patchedReplaceState(
      ...args: Parameters<typeof history.replaceState>
    ): void {
      originalReplaceState(...args);
      handleUrlChange();
    };

    // Also handle back/forward navigation.
    window.addEventListener("popstate", handleUrlChange);

    return () => {
      // Cancel any in-flight re-read so callbacks don't fire on an unmounted component.
      clearTimeout(timerId.current);
      // Restore the originals captured at mount so sequential mount/unmount
      // cycles don't leave our patch (or stack patches) on history.pushState /
      // replaceState. This does NOT defend against two instances patching
      // concurrently — true simultaneous double-injection would have the second
      // instance capture the first's patched function as its "original".
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", handleUrlChange);
    };
  }, []);

  if (!profileText) return null;
  return <VoiceMatchBadge profileText={profileText} />;
}
