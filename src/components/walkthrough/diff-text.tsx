"use client"

import * as React from "react"
import { motion } from "framer-motion"

import { computeWordDiff } from "./diff"

interface DiffTextProps {
  before: string
  after: string
  /** Stagger reveal index so each diff line cascades in on first view. */
  index?: number
}

/**
 * Renders a word-level diff: removed text struck-through red, added text green,
 * unchanged in the default colour. Uses a Framer Motion stagger so the diff
 * cascades in on first view (no CSS transitions for user-facing motion).
 */
export function DiffText({ before, after, index = 0 }: DiffTextProps) {
  const segments = React.useMemo(
    () => computeWordDiff(before, after),
    [before, after]
  )

  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05, ease: "easeOut" }}
    >
      {segments.map((seg, i) => {
        if (seg.type === "removed") {
          return (
            <span
              key={i}
              className="text-red-700 line-through decoration-red-500/70 dark:text-red-400"
              data-diff="removed"
            >
              {seg.text}
            </span>
          )
        }
        if (seg.type === "added") {
          return (
            <span
              key={i}
              className="rounded-sm bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300"
              data-diff="added"
            >
              {seg.text}
            </span>
          )
        }
        return (
          <span key={i} data-diff="unchanged">
            {seg.text}
          </span>
        )
      })}
    </motion.span>
  )
}
