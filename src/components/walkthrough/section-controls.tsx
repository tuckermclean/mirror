"use client"

import { Check, X, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ProfileSection, SectionDecision } from "./types"

interface SectionControlsProps {
  section: ProfileSection
  sectionLabel: string
  decision: SectionDecision
  onDecision: (section: ProfileSection, decision: SectionDecision) => void
  onEdit: (section: ProfileSection) => void
}

/**
 * Per-section Accept / Reject / Edit controls.
 *
 * All three are real <button>s rendered in DOM order so Tab reaches them and a
 * visible focus ring (focus-visible:ring) marks the active control. Pressed
 * state is announced via aria-pressed for screen readers.
 */
export function SectionControls({
  section,
  sectionLabel,
  decision,
  onDecision,
  onEdit,
}: SectionControlsProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label={`Decision for ${sectionLabel}`}
      data-testid={`section-controls-${section}`}
    >
      <Button
        type="button"
        size="sm"
        variant={decision === "accept" ? "default" : "outline"}
        aria-pressed={decision === "accept"}
        aria-label={`Accept ${sectionLabel}`}
        data-testid={`accept-${section}`}
        onClick={() => onDecision(section, "accept")}
      >
        <Check aria-hidden />
        Accept
      </Button>
      <Button
        type="button"
        size="sm"
        variant={decision === "reject" ? "destructive" : "outline"}
        aria-pressed={decision === "reject"}
        aria-label={`Reject ${sectionLabel}`}
        data-testid={`reject-${section}`}
        onClick={() => onDecision(section, "reject")}
      >
        <X aria-hidden />
        Reject
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Edit ${sectionLabel}`}
        data-testid={`edit-${section}`}
        onClick={() => onEdit(section)}
      >
        <Pencil aria-hidden />
        Edit
      </Button>
    </div>
  )
}
