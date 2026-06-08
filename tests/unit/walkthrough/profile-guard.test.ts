import { describe, it, expect } from "vitest";
import { isGeneratedProfile } from "@/components/walkthrough/profile-guard";
import { WALKTHROUGH_FIXTURE } from "@/components/walkthrough/fixture";

describe("isGeneratedProfile", () => {
  it("accepts a well-formed profile (the demo fixture before)", () => {
    expect(isGeneratedProfile(WALKTHROUGH_FIXTURE.before)).toBe(true);
    expect(isGeneratedProfile(WALKTHROUGH_FIXTURE.after)).toBe(true);
  });

  it("accepts a minimal valid profile with empty collections", () => {
    expect(
      isGeneratedProfile({
        headline: "",
        about: "",
        experience: [],
        education: [],
        skills: [],
      })
    ).toBe(true);
  });

  it("rejects null and non-objects", () => {
    expect(isGeneratedProfile(null)).toBe(false);
    expect(isGeneratedProfile(undefined)).toBe(false);
    expect(isGeneratedProfile("string")).toBe(false);
    expect(isGeneratedProfile(42)).toBe(false);
    expect(isGeneratedProfile([])).toBe(false);
  });

  it("rejects when string fields have the wrong type", () => {
    expect(
      isGeneratedProfile({
        headline: 123,
        about: "ok",
        experience: [],
        education: [],
        skills: [],
      })
    ).toBe(false);
  });

  it("rejects when skills is not an array of strings", () => {
    expect(
      isGeneratedProfile({
        headline: "h",
        about: "a",
        experience: [],
        education: [],
        skills: ["ok", 5],
      })
    ).toBe(false);
  });

  it("rejects when an experience entry is malformed", () => {
    expect(
      isGeneratedProfile({
        headline: "h",
        about: "a",
        experience: [{ company: "Acme", title: "Eng" }], // missing bullets[]
        education: [],
        skills: [],
      })
    ).toBe(false);

    expect(
      isGeneratedProfile({
        headline: "h",
        about: "a",
        experience: [{ company: "Acme", title: "Eng", bullets: [1, 2] }],
        education: [],
        skills: [],
      })
    ).toBe(false);
  });

  it("rejects when an education entry is malformed", () => {
    expect(
      isGeneratedProfile({
        headline: "h",
        about: "a",
        experience: [],
        education: [{ school: "State" }], // missing degree
        skills: [],
      })
    ).toBe(false);
  });

  it("rejects when required keys are missing entirely", () => {
    expect(isGeneratedProfile({ headline: "h" })).toBe(false);
  });
});
