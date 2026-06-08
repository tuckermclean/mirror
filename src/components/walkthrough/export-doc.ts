import type { GeneratedProfile, ProfileSection, SectionDecision } from "./types"

/**
 * Build the plain-text body of the exported profile doc, respecting per-section
 * accept/reject decisions: a rejected section falls back to the "before" text so
 * the user never pastes a change they declined.
 */
export function buildExportText(
  before: GeneratedProfile,
  after: GeneratedProfile,
  decisions: Record<ProfileSection, SectionDecision>
): string {
  const pick = (section: ProfileSection) =>
    decisions[section] === "reject" ? before : after

  const headlineSrc = pick("headline")
  const aboutSrc = pick("about")
  const experienceSrc = pick("experience")
  const skillsSrc = pick("skills")

  const lines: string[] = []
  lines.push("MIRROR — Your rewritten LinkedIn profile", "")
  lines.push("HEADLINE", headlineSrc.headline, "")
  lines.push("ABOUT", aboutSrc.about, "")
  lines.push("EXPERIENCE")
  for (const exp of experienceSrc.experience) {
    lines.push(`${exp.title} — ${exp.company}`)
    for (const bullet of exp.bullets) lines.push(`  • ${bullet}`)
    lines.push("")
  }
  lines.push("EDUCATION")
  // Education intentionally always uses the "after" value: Mirror does not
  // rewrite education (it is verbatim factual data), so there is no per-section
  // accept/reject decision for it — before and after are identical here.
  for (const edu of after.education) lines.push(`${edu.degree} — ${edu.school}`)
  lines.push("")
  lines.push("SKILLS", skillsSrc.skills.join(", "))
  return lines.join("\n")
}

/** Filename for the exported doc — matches /mirror-profile/i (commit.spec.ts). */
export const EXPORT_DOC_FILENAME = "mirror-profile.txt"
