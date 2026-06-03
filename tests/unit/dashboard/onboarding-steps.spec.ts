import { describe, it, expect } from "vitest";
import { computeOnboardingProgress } from "@/lib/dashboard/onboarding-progress";
import { getStep3Icon } from "@/lib/dashboard/onboarding-progress";

describe("computeOnboardingProgress", () => {
  it("returns 0% and unlocked=false when no steps complete", () => {
    const result = computeOnboardingProgress({
      step1Complete: false,
      step2Complete: false,
      step3Complete: false,
    });
    expect(result.stepsComplete).toBe(0);
    expect(result.progressValue).toBe(0);
    expect(result.step3Unlocked).toBe(false);
  });

  it("returns 33% when only step 1 complete", () => {
    const result = computeOnboardingProgress({
      step1Complete: true,
      step2Complete: false,
      step3Complete: false,
    });
    expect(result.stepsComplete).toBe(1);
    expect(result.progressValue).toBe(33);
    expect(result.step3Unlocked).toBe(false);
  });

  it("returns 33% when only step 2 complete", () => {
    const result = computeOnboardingProgress({
      step1Complete: false,
      step2Complete: true,
      step3Complete: false,
    });
    expect(result.stepsComplete).toBe(1);
    expect(result.progressValue).toBe(33);
    expect(result.step3Unlocked).toBe(false);
  });

  it("returns 67% and unlocked=true when steps 1 and 2 complete", () => {
    const result = computeOnboardingProgress({
      step1Complete: true,
      step2Complete: true,
      step3Complete: false,
    });
    expect(result.stepsComplete).toBe(2);
    expect(result.progressValue).toBe(67);
    expect(result.step3Unlocked).toBe(true);
  });

  it("returns 100% when all three steps complete", () => {
    const result = computeOnboardingProgress({
      step1Complete: true,
      step2Complete: true,
      step3Complete: true,
    });
    expect(result.stepsComplete).toBe(3);
    expect(result.progressValue).toBe(100);
    expect(result.step3Unlocked).toBe(true);
  });

  it("step3Unlocked requires both step1 and step2 — not step3 alone", () => {
    const result = computeOnboardingProgress({
      step1Complete: false,
      step2Complete: false,
      step3Complete: true,
    });
    expect(result.step3Unlocked).toBe(false);
  });
});

describe("getStep3Icon", () => {
  it("returns 'check' when step3Complete is true", () => {
    expect(getStep3Icon({ step3Complete: true, step3Unlocked: true })).toBe("check");
  });

  it("returns 'check' even when step3Complete is true but step3Unlocked is false (data inconsistency)", () => {
    expect(getStep3Icon({ step3Complete: true, step3Unlocked: false })).toBe("check");
  });

  it("returns 'circle' when unlocked but not yet complete", () => {
    expect(getStep3Icon({ step3Complete: false, step3Unlocked: true })).toBe("circle");
  });

  it("returns 'lock' when not yet unlocked and not complete", () => {
    expect(getStep3Icon({ step3Complete: false, step3Unlocked: false })).toBe("lock");
  });
});
