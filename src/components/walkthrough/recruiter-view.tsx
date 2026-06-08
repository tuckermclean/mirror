"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { RecruiterEyeItem } from "./types"

interface RecruiterViewProps {
  items: RecruiterEyeItem[]
}

/** Seconds the eye-track simulation runs before showing the full ranked list. */
const SIMULATION_SECONDS = 7

/**
 * Recruiter-view heatmap overlay.
 *
 * Runs a SIMULATION_SECONDS eye-track simulation: ranked "what jumps out" items
 * (from rationale.recruiterEye) reveal one by one as a callout, then the full
 * ranked list settles. Honours prefers-reduced-motion by revealing everything
 * at once. Implemented as a labelled modal dialog with a focusable close button.
 */
export function RecruiterView({ items }: RecruiterViewProps) {
  const [open, setOpen] = React.useState(false)
  const [revealed, setRevealed] = React.useState(0)
  const ranked = React.useMemo(
    () => [...items].sort((a, b) => a.rank - b.rank),
    [items]
  )

  React.useEffect(() => {
    if (!open) {
      setRevealed(0)
      return
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      setRevealed(ranked.length)
      return
    }
    const perItem = (SIMULATION_SECONDS * 1000) / Math.max(ranked.length, 1)
    const timers = ranked.map((_, i) =>
      setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), perItem * (i + 1))
    )
    return () => timers.forEach(clearTimeout)
  }, [open, ranked])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="recruiter-view-btn"
        onClick={() => setOpen(true)}
      >
        <Eye aria-hidden />
        Recruiter view
      </Button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Recruiter view: what jumps out in 7 seconds"
            data-testid="recruiter-overlay"
          >
            <motion.div
              className="w-full max-w-md rounded-xl bg-card p-5 text-card-foreground shadow-xl ring-1 ring-foreground/10"
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Eye className="size-4 text-primary" aria-hidden />
                  What a recruiter sees in {SIMULATION_SECONDS}s
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="recruiter-close"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </div>
              <ol className="space-y-2">
                {ranked.map((item, i) => (
                  <motion.li
                    key={item.rank}
                    initial={{ opacity: 0, x: -8 }}
                    animate={
                      i < revealed
                        ? { opacity: 1, x: 0 }
                        : { opacity: 0.25, x: -8 }
                    }
                    transition={{ duration: 0.3 }}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background/60 p-2.5"
                    data-testid="recruiter-callout"
                  >
                    <span
                      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                      aria-hidden
                    >
                      {item.rank}
                    </span>
                    <span className="text-sm leading-snug">
                      {item.observation}
                    </span>
                  </motion.li>
                ))}
              </ol>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
