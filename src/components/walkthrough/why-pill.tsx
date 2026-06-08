"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover"

interface WhyPillProps {
  /** The one-sentence rationale shown in the popover. */
  rationale: string
  /** Accessible label describing which section this explains. */
  sectionLabel: string
}

/**
 * The "Why?" pill. Clicking reveals a rationale popover.
 *
 * Whimsy: the sparkle nudges and the pill lifts on hover/active via Framer Motion
 * applied to inner content, while the trigger stays a Base UI native <button> so
 * its click/keyboard handling and focus management stay fully functional and the
 * popover is a real labelled dialog. (Wrapping the trigger itself in motion.button
 * drops Base UI's injected handlers, so motion lives on the children instead.)
 */
export function WhyPill({ rationale, sectionLabel }: WhyPillProps) {
  return (
    <Popover>
      <PopoverTrigger
        data-testid="why-pill"
        aria-label={`Why we changed the ${sectionLabel}`}
        className="group/why inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary outline-none hover:bg-primary/20 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <motion.span
          aria-hidden
          animate={{ rotate: [0, -12, 12, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.5 }}
          className="inline-flex"
        >
          <Sparkles className="size-3" />
        </motion.span>
        Why?
      </PopoverTrigger>
      <PopoverContent data-testid="rationale-popover" className="w-80">
        <PopoverTitle className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          Why this works
        </PopoverTitle>
        <PopoverDescription className="text-sm leading-relaxed text-muted-foreground">
          {rationale}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
