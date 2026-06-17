/**
 * Local data contract for the walkthrough UI.
 *
 * These interfaces mirror the shape the generation pipeline emits
 * (`generations.output` / `generations.rationale`) and the parsed LinkedIn
 * snapshot (`linkedin_snapshots.parsed`). They are declared locally — NOT
 * imported from `src/lib/generation/` — because that module is built in
 * parallel and may not exist in this worktree. Keep these in lockstep with the
 * generation specialist's published contract.
 */

export interface ExperienceEntry {
  company: string;
  title: string;
  bullets: string[];
}

export interface EducationEntry {
  school: string;
  degree: string;
}

/** `generations.output` — the "after". `linkedin_snapshots.parsed` — the "before". */
export interface GeneratedProfile {
  headline: string;
  about: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
}

/** A section of the profile that the walkthrough treats as an editable unit. */
export type ProfileSection = "headline" | "about" | "experience" | "skills";

export interface RecruiterEyeItem {
  rank: number;
  observation: string;
  section: ProfileSection;
}

export interface ConfidenceScores {
  headline: number;
  about: number;
  experience: number;
  skills: number;
}

/** `generations.rationale`. */
export interface RationaleBundle {
  headline: string;
  about: string;
  experience: string[];
  skills: string;
  recruiterEye: RecruiterEyeItem[];
  confidence: ConfidenceScores;
}

/** Voice Match payload the generation pipeline may attach to WalkthroughData. */
export interface VoiceMatchPayload {
  score: number;
  components?: { cosine: number; feature: number };
}

/** Everything the walkthrough client needs to render. */
export interface WalkthroughData {
  generationId: string;
  before: GeneratedProfile;
  after: GeneratedProfile;
  rationale: RationaleBundle;
  /** True when the row came from the built-in demo fixture rather than the DB. */
  isFixture: boolean;
  /**
   * Optional Voice Match payload from `scoreVoiceMatch`. Present when the
   * generation pipeline has computed a score; absent for legacy rows and
   * the demo fixture. Read defensively — the walkthrough renders without it.
   */
  voiceMatch?: VoiceMatchPayload;
}

/** Per-section decision the user makes in the walkthrough. */
export type SectionDecision = "accept" | "reject";

export type CommitMethod = "export-doc" | "in-app";
