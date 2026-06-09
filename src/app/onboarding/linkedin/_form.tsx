"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitLinkedInForm } from "./_actions";

type FormStatus = "idle" | "loading" | "success" | "error";

/** How long to hold the success state before redirecting to the dashboard. */
const SUCCESS_REDIRECT_DELAY_MS = 900;

/** Human-readable label for each status — mirrored in the aria-live region. */
function buttonLabel(status: FormStatus): string {
  if (status === "loading") return "Connecting…";
  if (status === "success") return "Done — redirecting…";
  return "Connect LinkedIn";
}

export function LinkedInForm() {
  const router = useRouter();
  const [status, setStatus] = React.useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string>("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);

    try {
      const result = await submitLinkedInForm(formData);

      if (result.success) {
        setStatus("success");
        // Brief success animation before redirect
        await new Promise((resolve) =>
          setTimeout(resolve, SUCCESS_REDIRECT_DELAY_MS)
        );
        router.push("/dashboard");
      } else {
        setStatus("error");
        setErrorMessage(result.error);
      }
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  }

  const hasError = status === "error" && Boolean(errorMessage);

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5" noValidate>
      {/* LinkedIn profile URL */}
      <div className="space-y-1.5">
        <Label htmlFor="profileUrl">LinkedIn profile URL</Label>
        <Input
          id="profileUrl"
          name="profileUrl"
          type="url"
          placeholder="https://www.linkedin.com/in/yourhandle"
          data-testid="linkedin-url-input"
          autoComplete="url"
          required
          aria-required="true"
          aria-invalid={hasError ? "true" : undefined}
          aria-describedby={hasError ? "error-alert-id" : undefined}
          disabled={status === "loading" || status === "success"}
        />
        <p className="text-xs text-muted-foreground">
          Your public LinkedIn profile URL (required for Tier A scraping)
        </p>
      </div>

      {/* Session cookie — Tier A live scrape */}
      <div className="space-y-1.5">
        <Label htmlFor="sessionCookie">
          Session cookie{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="sessionCookie"
          name="sessionCookie"
          type="password"
          placeholder="AQEDATexample…"
          data-testid="session-cookie-input"
          autoComplete="off"
          disabled={status === "loading" || status === "success"}
          // type="password" prevents shoulder-surfing. The cookie value is
          // encrypted server-side and NEVER echoed back to the client.
        />
        <p className="text-xs text-muted-foreground">
          Paste your <code className="font-mono">li_at</code> cookie for richer
          data. Stored encrypted; never returned to the browser.
        </p>
      </div>

      {/* Error feedback */}
      <AnimatePresence>
        {hasError && (
          <motion.div
            key="error-alert"
            id="error-alert-id"
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen-reader status announcement for button label changes (Suggestion 6) */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {buttonLabel(status)}
      </span>

      {/* Submit */}
      <Button
        type="submit"
        data-testid="submit-linkedin"
        disabled={status === "loading" || status === "success"}
        className="w-full"
      >
        <AnimatePresence mode="wait" initial={false}>
          {status === "loading" && (
            <motion.span
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Connecting…
            </motion.span>
          )}
          {status === "success" && (
            <motion.span
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="size-4" aria-hidden />
              Done — redirecting…
            </motion.span>
          )}
          {(status === "idle" || status === "error") && (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Connect LinkedIn
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </form>
  );
}
