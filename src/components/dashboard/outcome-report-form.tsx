"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildReportPayload, getSubmitButtonProps, type ReportFormFields } from "@/lib/outcomes/report-form";

interface OutcomeReportFormProps {
  /** Default ISO week (YYYY-MM-DD) — typically the current week's Monday. */
  defaultWeek: string;
}

const METRIC_FIELDS = [
  { key: "profileViews", label: "Profile views", testId: "outcome-profile-views" },
  { key: "searchAppearances", label: "Search appearances", testId: "outcome-search-appearances" },
  { key: "recruiterMsgs", label: "Recruiter messages", testId: "outcome-recruiter-msgs" },
  { key: "postImpressions", label: "Post impressions", testId: "outcome-post-impressions" },
] as const;

const EMPTY_METRICS = {
  profileViews: "",
  searchAppearances: "",
  recruiterMsgs: "",
  postImpressions: "",
};

/**
 * Weekly self-report capture form (Week 4 "Outcome tracking"). Posts a
 * `self_report` outcome row to /api/outcomes. Validation is delegated to the
 * pure, unit-tested helpers in src/lib/outcomes/report-form.ts.
 */
export function OutcomeReportForm({ defaultWeek }: OutcomeReportFormProps) {
  const [weekOf, setWeekOf] = useState(defaultWeek);
  const [metrics, setMetrics] = useState<Record<string, string>>({ ...EMPTY_METRICS });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const built = buildReportPayload({ weekOf, ...metrics } as ReportFormFields);
    if (!built.ok) {
      toast.error(built.error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.value),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSubmitted(true);
      setMetrics({ ...EMPTY_METRICS });
      toast.success("Thanks — your weekly numbers are saved.");
    } catch {
      toast.error("Could not save your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">This week&apos;s numbers</CardTitle>
        <CardDescription>
          Enter what you see in LinkedIn. Leave a field blank for 0.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form data-testid="outcome-report-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="outcome-week-of">Week of</Label>
            <Input
              id="outcome-week-of"
              data-testid="outcome-week-of"
              type="date"
              value={weekOf}
              onChange={(e) => setWeekOf(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {METRIC_FIELDS.map(({ key, label, testId }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`outcome-${key}`}>{label}</Label>
                <Input
                  id={`outcome-${key}`}
                  data-testid={testId}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="0"
                  value={metrics[key]}
                  onChange={(e) =>
                    setMetrics((m) => ({ ...m, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {(() => {
              const btnProps = getSubmitButtonProps({ submitting, submitted });
              return (
                <Button
                  type="submit"
                  size="sm"
                  data-testid="outcome-report-submit"
                  disabled={btnProps.disabled}
                >
                  {btnProps.label}
                </Button>
              );
            })()}
            {submitted ? (
              <motion.span
                data-testid="outcome-report-success"
                role="status"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="text-sm text-green-600"
              >
                Saved ✓
              </motion.span>
            ) : null}
            {submitted ? (
              <motion.button
                type="button"
                data-testid="outcome-report-update"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, delay: 0.1 }}
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setSubmitted(false)}
              >
                Update this week?
              </motion.button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
