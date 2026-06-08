"use client"

import { motion } from "framer-motion"

interface ConfidenceScoreProps {
  /** 0–100 confidence for this section. */
  value: number
  sectionLabel: string
}

function toneClasses(value: number): string {
  if (value >= 85)
    return "border-green-700/40 bg-green-50 text-green-900 dark:border-green-500/30 dark:bg-green-950/60 dark:text-green-200"
  if (value >= 70)
    return "border-amber-700/40 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-200"
  return "border-foreground/30 bg-muted text-foreground"
}

/**
 * Floating per-section confidence score. Animates the count up on mount
 * (Framer Motion) — a functional cue that draws the eye to the model's
 * certainty without overwhelming the content.
 */
export function ConfidenceScore({ value, sectionLabel }: ConfidenceScoreProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      data-testid="confidence-score"
      role="img"
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses(clamped)}`}
      aria-label={`Confidence for ${sectionLabel}: ${clamped} out of 100`}
    >
      <span aria-hidden className="tabular-nums">{clamped}</span>
      <span aria-hidden>conf</span>
    </motion.span>
  )
}
