import { describe, it, expect } from "vitest";
import { voiceMatchTier, clampScore } from "@/components/walkthrough/voice-match-badge";

describe("clampScore", () => {
  it("clamps and rounds into [0, 100]", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(82.6)).toBe(83);
  });
});

describe("voiceMatchTier", () => {
  it("labels a strong match", () => {
    expect(voiceMatchTier(90).label).toBe("Strong voice match");
  });

  it("labels a fair match", () => {
    expect(voiceMatchTier(72).label).toBe("Good voice match");
  });

  it("labels a weak match", () => {
    expect(voiceMatchTier(40).label).toBe("Off your voice");
  });

  it("returns a non-empty Tailwind class string for each tier", () => {
    for (const v of [95, 75, 30]) {
      expect(voiceMatchTier(v).className.length).toBeGreaterThan(0);
    }
  });

  // Exact boundary values — verify the >= comparisons include the boundary score.
  it("score === 80 is 'strong', not 'good' (boundary: >= 80 triggers strong tier)", () => {
    expect(voiceMatchTier(80).label).toBe("Strong voice match");
  });

  it("score === 65 is 'good', not 'developing' (boundary: >= 65 triggers good tier)", () => {
    expect(voiceMatchTier(65).label).toBe("Good voice match");
  });
});
