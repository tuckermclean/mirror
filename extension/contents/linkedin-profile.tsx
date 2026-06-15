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
 */
import type { ReactElement } from "react";
import type { PlasmoCSConfig, PlasmoGetInlineAnchor } from "plasmo";
import { readProfile, profileToText } from "../lib/dom-reader";
import { VoiceMatchBadge } from "../components/VoiceMatchBadge.live";

export const config: PlasmoCSConfig = {
  matches: ["https://www.linkedin.com/in/*"],
  all_frames: false,
};

// Render the badge as an overlay anchored to the document body. Plasmo injects
// it into a Shadow DOM so LinkedIn's styles don't leak into the badge.
export const getInlineAnchor: PlasmoGetInlineAnchor = () => document.body;

export default function LinkedInProfileOverlay(): ReactElement | null {
  if (typeof document === "undefined") return null;
  const profile = readProfile(document);
  const profileText = profileToText(profile);
  if (!profileText) return null;
  return <VoiceMatchBadge profileText={profileText} />;
}
