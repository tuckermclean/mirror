"use client";

import { useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { LineChart, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OutcomeReportForm } from "@/components/dashboard/outcome-report-form";
import { isoWeekStart } from "@/lib/outcomes/report-form";

interface OutcomeTrackerProps {
  initialConsented: boolean;
}

const reveal: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

/**
 * Weekly outcome-tracking surface on the dashboard (Week 4 "Outcome
 * tracking"). A gentle nudge invites explicit consent; once granted, the
 * weekly self-report form appears. Revoke is always one click away and stops
 * collection immediately (the server clears the consent timestamp).
 */
export function OutcomeTracker({ initialConsented }: OutcomeTrackerProps) {
  const [consented, setConsented] = useState(initialConsented);
  const [busy, setBusy] = useState(false);
  const defaultWeek = isoWeekStart(new Date());

  async function setConsent(grant: boolean): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch("/api/outcomes/consent", {
        method: grant ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error(String(res.status));
      setConsented(grant);
      toast.success(
        grant ? "Outcome tracking is on." : "Outcome tracking is off."
      );
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="outcome-tracker" className="mt-10 space-y-4" aria-label="Outcome tracking">
      <div className="flex items-center gap-2">
        <LineChart className="size-5 text-primary shrink-0" aria-hidden="true" />
        <h2 className="text-xl font-semibold tracking-tight">Track your results</h2>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {consented ? (
          <motion.div
            key="form"
            variants={reveal}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <OutcomeReportForm defaultWeek={defaultWeek} />
            <Button
              data-testid="outcome-consent-revoke"
              variant="ghost"
              size="sm"
              className="mt-3 text-muted-foreground"
              disabled={busy}
              onClick={() => setConsent(false)}
            >
              Stop tracking my results
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="nudge"
            variants={reveal}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary shrink-0" aria-hidden="true" />
                  <CardTitle as="h3">See if your rewrite is working</CardTitle>
                </div>
                <CardDescription>
                  Share a few numbers each week — profile views, recruiter
                  messages — and Mirror will show you the lift after your
                  rewrite. It is optional, and you can turn it off anytime.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-start gap-3">
                <Button
                  data-testid="outcome-consent-grant"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConsent(true)}
                >
                  Track my results
                </Button>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                  Your numbers stay private and you control them.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
