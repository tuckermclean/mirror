"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";

/** Clamp an arbitrary number into an integer Voice Match Score in [0, 100]. */
export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

interface VoiceMatchTier {
  label: string;
  /** Tailwind classes — WCAG AA contrast in both light and dark themes. */
  className: string;
}

/**
 * Map a Voice Match Score to a human-readable tier + a high-contrast color.
 * Pure and exported so the tier logic is unit-tested without rendering React.
 */
export function voiceMatchTier(score: number): VoiceMatchTier {
  if (score >= 80) {
    return {
      label: "Strong voice match",
      className:
        "border-green-700/40 bg-green-50 text-green-900 dark:border-green-500/30 dark:bg-green-950/60 dark:text-green-100",
    };
  }
  if (score >= 65) {
    return {
      label: "Good voice match",
      className:
        "border-amber-700/40 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-100",
    };
  }
  return {
    label: "Off your voice",
    className:
      "border-foreground/30 bg-muted text-foreground dark:text-foreground",
  };
}

/** Animated count-up number, respecting reduced-motion via Framer Motion. */
function CountUp({ to }: { to: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));

  React.useEffect(() => {
    const controls = animate(count, to, { duration: 0.8, ease: "easeOut" });
    return () => controls.stop();
  }, [count, to]);

  return <motion.span className="tabular-nums">{rounded}</motion.span>;
}

export interface VoiceMatchBadgeProps {
  /** 0–100 Voice Match Score from `scoreVoiceMatch`. */
  value: number;
  /** Optional transparency breakdown (0–1 each) for the explainer popover. */
  components?: { cosine: number; feature: number } | undefined;
}

/**
 * Voice Match badge for the walkthrough header.
 *
 * Renders how well the rewrite matches the USER'S authentic voice (SPEC §6.3) —
 * distinct from per-section model confidence. Animates a count-up on mount
 * (Framer Motion, no CSS transitions) and opens a keyboard-reachable popover
 * explaining the score's two components.
 */
export function VoiceMatchBadge({ value, components }: VoiceMatchBadgeProps) {
  const score = clampScore(value);
  const tier = voiceMatchTier(score);
  const ariaLabel = `${tier.label}: Voice Match Score ${score} out of 100. Open for details.`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <motion.button
            type="button"
            data-testid="voice-match-badge"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            aria-label={ariaLabel}
          />
        }
      >
        <Badge
          variant="outline"
          className={`cursor-pointer gap-1 ${tier.className}`}
        >
          <span aria-hidden>Voice</span>
          <CountUp to={score} />
        </Badge>
      </PopoverTrigger>
      <PopoverContent align="end">
        <PopoverTitle className="text-sm font-semibold">
          Voice Match Score: {score}/100
        </PopoverTitle>
        <PopoverDescription className="mt-1 text-xs text-muted-foreground">
          {tier.label}. How closely this rewrite reads in your own voice — not
          the model&apos;s confidence in the wording.
        </PopoverDescription>
        {components ? (
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Semantic similarity</dt>
              <dd className="tabular-nums font-medium">
                {Math.round(components.cosine * 100)}%
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Vocabulary &amp; cadence</dt>
              <dd className="tabular-nums font-medium">
                {Math.round(components.feature * 100)}%
              </dd>
            </div>
          </dl>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
