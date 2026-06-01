export interface OnboardingProgressInput {
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
}

export interface OnboardingProgressResult {
  stepsComplete: number;
  progressValue: number;
  step3Unlocked: boolean;
}

export function computeOnboardingProgress(
  input: OnboardingProgressInput
): OnboardingProgressResult {
  const stepsComplete = [
    input.step1Complete,
    input.step2Complete,
    input.step3Complete,
  ].filter(Boolean).length;
  const progressValue = Math.round((stepsComplete / 3) * 100);
  const step3Unlocked = input.step1Complete && input.step2Complete;
  return { stepsComplete, progressValue, step3Unlocked };
}
