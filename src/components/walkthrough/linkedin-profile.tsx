"use client"

import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import type {
  ExperienceEntry,
  GeneratedProfile,
  ProfileSection,
  RationaleBundle,
  SectionDecision,
} from "./types"
import { alignExperience, type ExperiencePair } from "./diff"
import { DiffText } from "./diff-text"
import { WhyPill } from "./why-pill"
import { ConfidenceScore } from "./confidence-score"
import { SectionControls } from "./section-controls"

export type ProfileViewMode = "before" | "after" | "diff"

interface LinkedInProfileProps {
  before: GeneratedProfile
  after: GeneratedProfile
  rationale: RationaleBundle
  mode: ProfileViewMode
  decisions: Record<ProfileSection, SectionDecision>
  onDecision: (section: ProfileSection, decision: SectionDecision) => void
  onEdit: (section: ProfileSection) => void
}

const SECTION_LABELS: Record<ProfileSection, string> = {
  headline: "headline",
  about: "About section",
  experience: "experience",
  skills: "skills",
}

/** Header row shared by every editable section: title + controls + confidence. */
function SectionHeader({
  title,
  section,
  rationale,
  confidence,
  decisions,
  onDecision,
  onEdit,
  showControls,
}: {
  title: string
  section: ProfileSection
  rationale: string
  confidence: number
  decisions: Record<ProfileSection, SectionDecision>
  onDecision: (section: ProfileSection, decision: SectionDecision) => void
  onEdit: (section: ProfileSection) => void
  showControls: boolean
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-[#000000e6] dark:text-foreground">
          {title}
        </h2>
        {showControls ? (
          <>
            <WhyPill rationale={rationale} sectionLabel={SECTION_LABELS[section]} />
            <ConfidenceScore
              value={confidence}
              sectionLabel={SECTION_LABELS[section]}
            />
          </>
        ) : null}
      </div>
      {showControls ? (
        <SectionControls
          section={section}
          sectionLabel={SECTION_LABELS[section]}
          decision={decisions[section]}
          onDecision={onDecision}
          onEdit={onEdit}
        />
      ) : null}
    </div>
  )
}

/** Pick the text to render for a section given the current view mode. */
function textFor(
  mode: ProfileViewMode,
  beforeText: string,
  afterText: string,
  index = 0
): React.ReactNode {
  if (mode === "before") return beforeText
  if (mode === "after") return afterText
  return <DiffText before={beforeText} after={afterText} index={index} />
}

/** A single experience entry rendered whole as added (green) or removed (red). */
function WholeEntry({
  entry,
  variant,
  index,
}: {
  entry: ExperienceEntry
  variant: "added" | "removed"
  index: number
}) {
  const added = variant === "added"
  const titleClass = added
    ? "rounded-sm bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300"
    : "text-red-700 line-through decoration-red-500/70 dark:text-red-400"
  const bulletClass = added
    ? "marker:text-green-700 dark:marker:text-green-300"
    : "marker:text-red-700 dark:marker:text-red-400"
  return (
    <motion.li
      className="flex gap-3"
      data-diff={variant}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05, ease: "easeOut" }}
    >
      <div
        className="mt-0.5 size-10 shrink-0 rounded bg-[#00000014] dark:bg-muted"
        aria-hidden
      />
      <div className="min-w-0">
        <p className={`font-semibold ${titleClass}`}>{entry.title}</p>
        <p className={`text-sm ${titleClass}`}>{entry.company}</p>
        <ul className={`mt-1.5 list-disc space-y-1 pl-5 text-sm ${bulletClass}`}>
          {entry.bullets.map((bullet, bi) => (
            <li key={bi} className={titleClass}>
              {bullet}
            </li>
          ))}
        </ul>
      </div>
    </motion.li>
  )
}

/** Shared entry shell: avatar + title/company/bullets slot. */
function EntryShell({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <div
        className="mt-0.5 size-10 shrink-0 rounded bg-[#00000014] dark:bg-muted"
        aria-hidden
      />
      <div className="min-w-0">{children}</div>
    </li>
  )
}

/** A single experience entry as plain text (Before/After modes). */
function PlainEntry({ entry }: { entry: ExperienceEntry }) {
  return (
    <EntryShell>
      <p className="font-semibold text-[#000000e6] dark:text-foreground">
        {entry.title}
      </p>
      <p className="text-sm text-[#000000e6] dark:text-foreground">
        {entry.company}
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-[#00000099] dark:text-muted-foreground">
        {entry.bullets.map((bullet, bi) => (
          <li key={bi}>{bullet}</li>
        ))}
      </ul>
    </EntryShell>
  )
}

/** A matched entry in Diff mode: per-field and per-bullet word diff. */
function MatchedEntry({
  before,
  after,
  index,
}: {
  before: ExperienceEntry
  after: ExperienceEntry
  index: number
}) {
  const bulletCount = Math.max(before.bullets.length, after.bullets.length)
  return (
    <EntryShell>
      <p className="font-semibold text-[#000000e6] dark:text-foreground">
        <DiffText before={before.title} after={after.title} index={index} />
      </p>
      <p className="text-sm text-[#000000e6] dark:text-foreground">
        {after.company}
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-[#00000099] dark:text-muted-foreground">
        {Array.from({ length: bulletCount }).map((_, bi) => (
          <li key={bi}>
            <DiffText
              before={before.bullets[bi] ?? ""}
              after={after.bullets[bi] ?? ""}
              index={bi}
            />
          </li>
        ))}
      </ul>
    </EntryShell>
  )
}

/** Render one aligned pair in Diff mode (added/removed/matched). */
function DiffEntry({ pair, index }: { pair: ExperiencePair; index: number }) {
  if (pair.kind === "added" && pair.after) {
    return <WholeEntry entry={pair.after} variant="added" index={index} />
  }
  if (pair.kind === "removed" && pair.before) {
    return <WholeEntry entry={pair.before} variant="removed" index={index} />
  }
  if (pair.before && pair.after) {
    return <MatchedEntry before={pair.before} after={pair.after} index={index} />
  }
  return null
}

/**
 * Experience list. In Before/After it maps one side; in Diff it iterates the
 * union of both lists (via `alignExperience`) so no entry is dropped — added
 * entries render green, removed entries red strikethrough, matched entries get
 * the per-field/per-bullet word diff. Framer Motion stagger is preserved.
 */
function ExperienceList({
  before,
  after,
  mode,
}: {
  before: ExperienceEntry[]
  after: ExperienceEntry[]
  mode: ProfileViewMode
}) {
  if (mode !== "diff") {
    const list = mode === "before" ? before : after
    return (
      <>
        {list.map((entry, i) => (
          <PlainEntry key={`${entry.company}-${i}`} entry={entry} />
        ))}
      </>
    )
  }
  return (
    <>
      {alignExperience(before, after).map((pair, i) => (
        <DiffEntry key={`${pair.kind}-${i}`} pair={pair} index={i} />
      ))}
    </>
  )
}

/**
 * Pixel-faithful LinkedIn profile renderer.
 *
 * Mimics the LinkedIn card stack (intro card, About, Experience, Education,
 * Skills) for Before, After, or Diff. In Before/After mode each section shows a
 * Why? pill, confidence score, and accept/reject/edit controls.
 */
export function LinkedInProfile({
  before,
  after,
  rationale,
  mode,
  decisions,
  onDecision,
  onEdit,
}: LinkedInProfileProps) {
  const showControls = mode !== "diff"
  const headerProps = {
    decisions,
    onDecision,
    onEdit,
    showControls,
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {/* Intro / headline card */}
      <section className="rounded-xl border border-[#00000014] bg-white p-5 shadow-sm dark:border-border dark:bg-card">
        <div className="flex items-start gap-4">
          <div
            className="size-20 shrink-0 rounded-full bg-gradient-to-br from-sky-200 to-indigo-200 dark:from-sky-900 dark:to-indigo-900"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <SectionHeader
              title="Jordan Avery"
              section="headline"
              rationale={rationale.headline}
              confidence={rationale.confidence.headline}
              {...headerProps}
            />
            <p
              className="text-base text-[#000000e6] dark:text-foreground"
              data-section="headline"
            >
              {textFor(mode, before.headline, after.headline)}
            </p>
            <p className="mt-1 text-sm text-[#00000099] dark:text-muted-foreground">
              San Francisco Bay Area
            </p>
          </div>
        </div>
      </section>

      {/* About card */}
      <section className="rounded-xl border border-[#00000014] bg-white p-5 shadow-sm dark:border-border dark:bg-card">
        <SectionHeader
          title="About"
          section="about"
          rationale={rationale.about}
          confidence={rationale.confidence.about}
          {...headerProps}
        />
        <p
          className="text-sm leading-relaxed text-[#000000e6] whitespace-pre-line dark:text-foreground"
          data-section="about"
        >
          {textFor(mode, before.about, after.about)}
        </p>
      </section>

      {/* Experience card */}
      <section className="rounded-xl border border-[#00000014] bg-white p-5 shadow-sm dark:border-border dark:bg-card">
        <SectionHeader
          title="Experience"
          section="experience"
          rationale={rationale.experience.join(" ")}
          confidence={rationale.confidence.experience}
          {...headerProps}
        />
        <ul className="flex flex-col gap-4" data-section="experience">
          <ExperienceList
            before={before.experience}
            after={after.experience}
            mode={mode}
          />
        </ul>
      </section>

      {/* Education card (unchanged across before/after) */}
      <section className="rounded-xl border border-[#00000014] bg-white p-5 shadow-sm dark:border-border dark:bg-card">
        <h2 className="mb-2 text-lg font-semibold text-[#000000e6] dark:text-foreground">
          Education
        </h2>
        <ul className="flex flex-col gap-3" data-section="education">
          {after.education.map((edu, i) => (
            <li key={i} className="flex gap-3">
              <div
                className="mt-0.5 size-10 shrink-0 rounded bg-[#00000014] dark:bg-muted"
                aria-hidden
              />
              <div>
                <p className="font-semibold text-[#000000e6] dark:text-foreground">
                  {edu.school}
                </p>
                <p className="text-sm text-[#00000099] dark:text-muted-foreground">
                  {edu.degree}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Skills card */}
      <section className="rounded-xl border border-[#00000014] bg-white p-5 shadow-sm dark:border-border dark:bg-card">
        <SectionHeader
          title="Skills"
          section="skills"
          rationale={rationale.skills}
          confidence={rationale.confidence.skills}
          {...headerProps}
        />
        <div className="flex flex-wrap gap-2" data-section="skills">
          {mode === "diff" ? (() => {
            const beforeSet = new Set(before.skills)
            const afterSet = new Set(after.skills)
            const allSkills = [...new Set([...before.skills, ...after.skills])]
            return allSkills.map((skill, i) => {
              const isAdded = !beforeSet.has(skill)
              const isRemoved = !afterSet.has(skill)
              return (
                <span
                  key={`${skill}-${i}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    isAdded && "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200",
                    isRemoved && "border-red-300 bg-red-50 text-red-800 line-through dark:border-red-700 dark:bg-red-950 dark:text-red-200",
                    !isAdded && !isRemoved && "border-[#00000014] bg-[#f3f2ef] text-[#000000e6] dark:border-border dark:bg-muted dark:text-foreground",
                  )}
                >
                  {skill}
                </span>
              )
            })
          })() : (mode === "before" ? before.skills : after.skills).map((skill, i) => (
            <span
              key={`${skill}-${i}`}
              className="rounded-full border border-[#00000014] bg-[#f3f2ef] px-3 py-1 text-sm text-[#000000e6] dark:border-border dark:bg-muted dark:text-foreground"
            >
              {skill}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
