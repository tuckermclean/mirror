import { describe, it, expect } from "vitest";
import { loadFixture, FIXTURES } from "./_dom";
import {
  readProfile,
  profileToText,
  type ProfileFields,
} from "../../../extension/lib/dom-reader";

describe("readProfile — structural extraction across all 5 fixtures", () => {
  it("extracts a headline, about, and at least one experience for every fixture", () => {
    for (const name of FIXTURES) {
      const doc = loadFixture(name);
      const profile: ProfileFields = readProfile(doc);

      expect(profile.headline, `${name} headline`).toBeTypeOf("string");
      expect(profile.headline.length, `${name} headline non-empty`).toBeGreaterThan(0);
      expect(profile.about, `${name} about is string`).toBeTypeOf("string");
      expect(profile.experience.length, `${name} has experience`).toBeGreaterThan(0);

      for (const exp of profile.experience) {
        expect(exp.title.length, `${name} exp title`).toBeGreaterThan(0);
        expect(exp.company.length, `${name} exp company`).toBeGreaterThan(0);
        expect(Array.isArray(exp.bullets), `${name} bullets array`).toBe(true);
      }
    }
  });
});

describe("readProfile — profile-fixture.html (pv- / data-testid variant)", () => {
  const profile = readProfile(loadFixture("profile-fixture.html"));

  it("reads the exact headline", () => {
    expect(profile.headline).toBe(
      "Staff Engineer · Distributed Systems · Open-Source Advocate",
    );
  });

  it("reads the About text and preserves its substance", () => {
    expect(profile.about).toContain("I build systems that scale to millions of users");
    expect(profile.about).toContain("12 k GitHub stars");
  });

  it("reads two experiences with correct titles and companies", () => {
    expect(profile.experience).toHaveLength(2);
    expect(profile.experience[0].title).toBe("Staff Software Engineer");
    expect(profile.experience[0].company).toBe("Acme Cloud");
    expect(profile.experience[1].title).toBe("Senior Software Engineer");
    expect(profile.experience[1].company).toBe("Buildkite");
  });

  it("captures the single-paragraph description as one bullet", () => {
    expect(profile.experience[0].bullets).toHaveLength(1);
    expect(profile.experience[0].bullets[0]).toContain("event-driven microservices");
  });
});

describe("readProfile — seed-profile.html (core-section-container variant)", () => {
  const profile = readProfile(loadFixture("seed-profile.html"));

  it("reads the headline", () => {
    expect(profile.headline).toBe("Senior Software Engineer at Acme Corp");
  });

  it("reads three experiences", () => {
    expect(profile.experience).toHaveLength(3);
    expect(profile.experience[0].company).toBe("Acme Corp");
    expect(profile.experience[2].title).toBe("Junior Software Engineer");
  });

  it("splits <ul><li> descriptions into individual bullets", () => {
    expect(profile.experience[0].bullets).toHaveLength(4);
    expect(profile.experience[0].bullets[0]).toContain(
      "Redesigned payment processing pipeline",
    );
    expect(profile.experience[2].bullets).toHaveLength(2);
  });
});

describe("readProfile — profile-pm.html (pv- variant with <ul> bullets)", () => {
  const profile = readProfile(loadFixture("profile-pm.html"));

  it("reads the headline and strips the company suffix from experience", () => {
    expect(profile.headline).toContain("Senior Product Manager");
    expect(profile.experience[0].company).toBe("Monzo Bank");
    expect(profile.experience[1].company).toBe("Stripe");
  });

  it("reads bullet lists", () => {
    expect(profile.experience[0].bullets.length).toBe(3);
    expect(profile.experience[0].bullets[0]).toContain("Owned the lending product line");
  });
});

describe("readProfile — profile-designer.html (public variant)", () => {
  const profile = readProfile(loadFixture("profile-designer.html"));

  it("reads headline and About", () => {
    expect(profile.headline).toContain("Staff Product Designer at Figma");
    expect(profile.about).toContain("Designer who codes enough to be dangerous");
  });

  it("reads two experiences with bullets", () => {
    expect(profile.experience).toHaveLength(2);
    expect(profile.experience[0].company).toBe("Figma");
    expect(profile.experience[0].bullets).toHaveLength(3);
  });
});

describe("readProfile — profile-minimal.html (no About, paragraph description)", () => {
  const profile = readProfile(loadFixture("profile-minimal.html"));

  it("returns empty About when none present", () => {
    expect(profile.about).toBe("");
  });

  it("still reads the single experience", () => {
    expect(profile.experience).toHaveLength(1);
    expect(profile.experience[0].title).toBe("Data Scientist");
    expect(profile.experience[0].company).toBe("Helix Health");
    expect(profile.experience[0].bullets).toHaveLength(1);
    expect(profile.experience[0].bullets[0]).toContain("clinical NLP models");
  });

  it("decodes HTML entities in the headline", () => {
    expect(profile.headline).toContain("NLP & clinical ML");
  });
});

describe("profileToText — concatenates fields for the voice-match request", () => {
  it("includes headline, about, and experience text", () => {
    const profile = readProfile(loadFixture("seed-profile.html"));
    const text = profileToText(profile);
    expect(text).toContain("Senior Software Engineer at Acme Corp");
    expect(text).toContain("I build distributed systems");
    expect(text).toContain("Redesigned payment processing pipeline");
  });

  it("produces a non-trivial blob for every fixture", () => {
    for (const name of FIXTURES) {
      const text = profileToText(readProfile(loadFixture(name)));
      expect(text.length, `${name} text length`).toBeGreaterThan(40);
    }
  });
});
