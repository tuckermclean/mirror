"use client"

import * as React from "react"

import type {
  GeneratedProfile,
  ProfileSection,
  RationaleBundle,
  SectionDecision,
} from "./types"
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
  const expSrc = mode === "before" ? before : after

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
          {expSrc.experience.map((exp, ei) => {
            const beforeExp = before.experience[ei]
            const afterExp = after.experience[ei]
            return (
              <li key={`${exp.company}-${ei}`} className="flex gap-3">
                <div
                  className="mt-0.5 size-10 shrink-0 rounded bg-[#00000014] dark:bg-muted"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-semibold text-[#000000e6] dark:text-foreground">
                    {mode === "diff" && beforeExp && afterExp
                      ? textFor(mode, beforeExp.title, afterExp.title, ei)
                      : exp.title}
                  </p>
                  <p className="text-sm text-[#000000e6] dark:text-foreground">
                    {exp.company}
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-[#00000099] dark:text-muted-foreground">
                    {exp.bullets.map((bullet, bi) => {
                      const beforeBullet = beforeExp?.bullets[bi] ?? ""
                      const afterBullet = afterExp?.bullets[bi] ?? ""
                      return (
                        <li key={bi}>
                          {mode === "diff"
                            ? textFor(mode, beforeBullet, afterBullet, bi)
                            : bullet}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </li>
            )
          })}
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
          {(mode === "before" ? before.skills : after.skills).map((skill, i) => (
            <span
              key={`${skill}-${i}`}
              className="rounded-full border border-[#00000014] bg-[#f3f2ef] px-3 py-1 text-sm text-[#000000e6] dark:border-border dark:bg-muted dark:text-foreground"
            >
              {skill}
            </span>
          ))}
        </div>
        {mode === "diff" ? (
          <div className="mt-2 text-sm">
            <DiffText
              before={before.skills.join(", ")}
              after={after.skills.join(", ")}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}
