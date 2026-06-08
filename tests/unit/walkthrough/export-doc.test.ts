import { describe, it, expect } from "vitest";
import { buildExportText, EXPORT_DOC_FILENAME } from "@/components/walkthrough/export-doc";
import type { GeneratedProfile, ProfileSection, SectionDecision } from "@/components/walkthrough/types";

const before: GeneratedProfile = {
  headline: "Old headline",
  about: "Old about",
  experience: [{ company: "Old Co", title: "Old Title", bullets: ["old bullet"] }],
  education: [{ school: "Old U", degree: "B.A." }],
  skills: ["OldSkill"],
};

const after: GeneratedProfile = {
  headline: "New headline",
  about: "New about",
  experience: [{ company: "New Co", title: "New Title", bullets: ["new bullet"] }],
  education: [{ school: "New U", degree: "B.S." }],
  skills: ["NewSkill"],
};

const allAccept: Record<ProfileSection, SectionDecision> = {
  headline: "accept",
  about: "accept",
  experience: "accept",
  skills: "accept",
};

describe("buildExportText", () => {
  it("uses the after text for accepted sections", () => {
    const text = buildExportText(before, after, allAccept);
    expect(text).toContain("New headline");
    expect(text).toContain("New about");
    expect(text).toContain("new bullet");
    expect(text).toContain("NewSkill");
  });

  it("falls back to before text for a rejected section", () => {
    const decisions = { ...allAccept, headline: "reject" as SectionDecision };
    const text = buildExportText(before, after, decisions);
    expect(text).toContain("Old headline");
    expect(text).not.toContain("New headline");
    // Other sections still accepted.
    expect(text).toContain("New about");
  });

  it("always includes a HEADLINE/ABOUT/EXPERIENCE/SKILLS structure", () => {
    const text = buildExportText(before, after, allAccept);
    for (const heading of ["HEADLINE", "ABOUT", "EXPERIENCE", "SKILLS"]) {
      expect(text).toContain(heading);
    }
  });

  it("exposes a filename matching /mirror-profile/i", () => {
    expect(EXPORT_DOC_FILENAME).toMatch(/mirror-profile/i);
  });
});
