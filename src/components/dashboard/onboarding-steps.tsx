"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { computeOnboardingProgress, getStep3Icon } from "@/lib/dashboard/onboarding-progress";

interface OnboardingStepsProps {
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
}

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export function OnboardingSteps({ step1Complete, step2Complete, step3Complete }: OnboardingStepsProps) {
  const { stepsComplete, progressValue, step3Unlocked } = computeOnboardingProgress({
    step1Complete,
    step2Complete,
    step3Complete,
  });

  return (
    <div data-testid="onboarding-steps" className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Mirror
        </h1>
        <p className="text-muted-foreground text-sm">
          Complete three steps to get your rewritten LinkedIn profile.
        </p>
        <Progress
          value={progressValue}
          aria-label={`Onboarding progress: ${stepsComplete} of 3 steps complete`}
          className="mt-4"
        >
          <ProgressLabel>Progress</ProgressLabel>
          <ProgressValue>{() => `${stepsComplete} of 3 complete`}</ProgressValue>
        </Progress>
      </div>

      <motion.ol
        className="space-y-4 list-none p-0 m-0"
        variants={container}
        initial="hidden"
        animate="visible"
        aria-label="Onboarding steps"
      >
        {/* Step 1 — Tell your story */}
        <motion.li variants={item} data-testid="step-1">
          <Card
            className={cn(
              step1Complete && "ring-green-500/40 bg-green-500/5"
            )}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  {step1Complete ? (
                    <CheckCircle2
                      className="size-5 text-green-600 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="size-5 text-primary shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <CardTitle as="h2">Tell your story</CardTitle>
                </div>
                {step1Complete ? (
                  <Badge
                    data-testid="step-1-complete"
                    variant="outline"
                    className="border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="default">Step 1</Badge>
                )}
              </div>
              <CardDescription>
                Mirror interviews you about your career, strengths, and goals to
                capture your authentic professional voice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/dashboard/interview"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                {step1Complete ? "Review interview" : "Start interview"}
              </Link>
            </CardContent>
          </Card>
        </motion.li>

        {/* Step 2 — Import your history */}
        <motion.li variants={item} data-testid="step-2">
          <Card
            className={cn(
              step2Complete && "ring-green-500/40 bg-green-500/5"
            )}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  {step2Complete ? (
                    <CheckCircle2
                      className="size-5 text-green-600 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="size-5 text-primary shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <CardTitle as="h2">Import your history</CardTitle>
                </div>
                {step2Complete ? (
                  <Badge
                    data-testid="step-2-complete"
                    variant="outline"
                    className="border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="secondary">Step 2</Badge>
                )}
              </div>
              <CardDescription>
                Upload your ChatGPT or Claude export so Mirror can learn your
                thinking patterns and improve voice fidelity.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3">
              <Link
                href="/dashboard/import"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Upload exports
              </Link>
              <Link
                href="/dashboard/generate"
                data-testid="skip-import"
                aria-label="Skip import — voice fidelity improves with your history"
                className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
              >
                Skip for now — voice fidelity improves with your history
              </Link>
            </CardContent>
          </Card>
        </motion.li>

        {/* Step 3 — See your Mirror */}
        <motion.li variants={item} data-testid="step-3">
          <Card
            className={cn(
              !step3Unlocked && !step3Complete && "opacity-60",
              step3Complete && "ring-green-500/40 bg-green-500/5"
            )}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  {getStep3Icon({ step3Complete, step3Unlocked }) === "check" ? (
                    <CheckCircle2
                      className="size-5 text-green-600 shrink-0"
                      aria-hidden="true"
                    />
                  ) : getStep3Icon({ step3Complete, step3Unlocked }) === "circle" ? (
                    <Circle
                      className="size-5 text-primary shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Lock
                      className="size-5 text-muted-foreground shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <CardTitle as="h2">See your Mirror</CardTitle>
                </div>
                {step3Complete ? (
                  <Badge
                    data-testid="step-3-complete"
                    variant="outline"
                    className="border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    Complete
                  </Badge>
                ) : (
                  <Badge variant={step3Unlocked ? "default" : "secondary"}>
                    Step 3
                  </Badge>
                )}
              </div>
              <CardDescription>
                Mirror rewrites your LinkedIn profile in your authentic voice
                with per-section rationale and a recruiter-eye heatmap.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step3Unlocked ? (
                <Link
                  href="/dashboard/generate"
                  data-testid="step-3-cta"
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  Generate profile
                </Link>
              ) : (
                <Button
                  size="sm"
                  disabled
                  aria-disabled="true"
                  data-testid="step-3-cta"
                >
                  Generate profile
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.li>
      </motion.ol>
    </div>
  );
}
