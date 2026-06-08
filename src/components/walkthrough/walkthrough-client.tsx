"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Download, GitCommitVertical, Lock } from "lucide-react"
import { toast } from "sonner"
import posthog from "posthog-js"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/logger"

import type {
  ProfileSection,
  SectionDecision,
  WalkthroughData,
} from "./types"
import { LinkedInProfile, type ProfileViewMode } from "./linkedin-profile"
import { RecruiterView } from "./recruiter-view"
import { isScrolledToEnd } from "./scroll-unlock"
import { buildExportText, EXPORT_DOC_FILENAME } from "./export-doc"

const SECTIONS: ProfileSection[] = ["headline", "about", "experience", "skills"]

function initialDecisions(): Record<ProfileSection, SectionDecision> {
  return {
    headline: "accept",
    about: "accept",
    experience: "accept",
    skills: "accept",
  }
}

/**
 * Telemetry sink for the scroll-unlock event.
 * Fires a PostHog capture when PostHog is initialized; always emits a
 * structured logger event as a fallback for server-side log aggregation.
 *
 * Uses posthog.config (public API) rather than the undocumented __loaded
 * property to check whether posthog.init() has been called.
 */
function trackScrollUnlock(generationId: string): void {
  logger.info("walkthrough_scroll_unlocked", { generationId })
  if (posthog.config?.api_host) {
    posthog.capture("walkthrough_scroll_unlocked", { generationId })
  }
}

export function WalkthroughClient({ data }: { data: WalkthroughData }) {
  const [mode, setMode] = React.useState<ProfileViewMode>("after")
  const [unlocked, setUnlocked] = React.useState(false)
  const [committed, setCommitted] = React.useState(false)
  const [decisions, setDecisions] = React.useState(initialDecisions)
  const unlockedRef = React.useRef(false)

  // Scroll-to-unlock gate on the window: unlock the commit button once the user
  // has scrolled the entire walkthrough, and fire the telemetry event once.
  React.useEffect(() => {
    function check() {
      const atEnd = isScrolledToEnd({
        scrollTop: window.scrollY,
        clientHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      })
      if (atEnd && !unlockedRef.current) {
        unlockedRef.current = true
        setUnlocked(true)
        trackScrollUnlock(data.generationId)
      }
    }
    check()
    window.addEventListener("scroll", check, { passive: true })
    window.addEventListener("resize", check)
    return () => {
      window.removeEventListener("scroll", check)
      window.removeEventListener("resize", check)
    }
  }, [data.generationId])

  const onDecision = React.useCallback(
    (section: ProfileSection, decision: SectionDecision) => {
      setDecisions((prev) => ({ ...prev, [section]: decision }))
    },
    []
  )

  const onEdit = React.useCallback((section: ProfileSection) => {
    toast.info(`Inline editing for ${section} is coming soon.`)
  }, [])

  const acceptedFields = React.useCallback(
    () =>
      Object.fromEntries(
        SECTIONS.map((s) => [s, decisions[s] === "accept"])
      ) as Record<ProfileSection, boolean>,
    [decisions]
  )

  const handleExport = React.useCallback(() => {
    const text = buildExportText(data.before, data.after, decisions)
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = EXPORT_DOC_FILENAME
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [data.before, data.after, decisions])

  const handleCommit = React.useCallback(async () => {
    try {
      const res = await fetch("/api/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          generationId: data.generationId,
          fieldsAccepted: acceptedFields(),
          method: "in-app",
        }),
      })
      // The seed/demo generation has no real DB row (and no session in tests), so
      // any non-ok response is treated as a successful demo commit — the fixture
      // exists purely to exercise the walkthrough without a seed.
      if (res.ok || data.isFixture) {
        setCommitted(true)
        toast.success("Changes committed.")
        return
      }
      toast.error("Could not commit your changes. Please try again.")
    } catch {
      // Network failure on a real commit surfaces an error; the demo still
      // succeeds so the walkthrough is fully demoable offline.
      if (data.isFixture) {
        setCommitted(true)
        toast.success("Changes committed.")
        return
      }
      toast.error("Could not commit your changes. Please try again.")
    }
  }, [data.generationId, data.isFixture, acceptedFields])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Your Mirror walkthrough</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare your current profile with the rewrite, see why each change works,
          and accept what fits. Scroll to the end to unlock commit.
        </p>
      </header>

      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as ProfileViewMode)}
        className="mb-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Profile comparison view">
            <TabsTrigger value="before">Before</TabsTrigger>
            <TabsTrigger value="after">After</TabsTrigger>
            <TabsTrigger value="diff">Diff</TabsTrigger>
          </TabsList>
          <RecruiterView items={data.rationale.recruiterEye} />
        </div>

        <TabsContent value="before">
          <LinkedInProfile
            {...data}
            mode="before"
            decisions={decisions}
            onDecision={onDecision}
            onEdit={onEdit}
          />
        </TabsContent>
        <TabsContent value="after">
          <LinkedInProfile
            {...data}
            mode="after"
            decisions={decisions}
            onDecision={onDecision}
            onEdit={onEdit}
          />
        </TabsContent>
        <TabsContent value="diff">
          <LinkedInProfile
            {...data}
            mode="diff"
            decisions={decisions}
            onDecision={onDecision}
            onEdit={onEdit}
          />
        </TabsContent>
      </Tabs>

      {/* Sticky action bar */}
      <motion.div
        className="sticky bottom-4 z-30 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/90 p-3 shadow-lg backdrop-blur"
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <p className="text-xs text-muted-foreground" data-testid="unlock-hint">
          {unlocked
            ? "Ready to commit — your accepted sections are saved on commit."
            : "Scroll through the full walkthrough to unlock commit."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="export-doc-btn"
            onClick={handleExport}
          >
            <Download aria-hidden />
            Export to doc
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="commit-btn"
            disabled={!unlocked || committed}
            onClick={handleCommit}
          >
            {unlocked ? (
              <GitCommitVertical aria-hidden />
            ) : (
              <Lock aria-hidden />
            )}
            {committed ? "Committed" : "Commit changes"}
          </Button>
        </div>
      </motion.div>

      {committed ? (
        <motion.div
          data-testid="commit-success"
          role="status"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm font-medium text-green-700 dark:text-green-300"
        >
          Your changes are committed. Open LinkedIn and paste each accepted
          section, or use the exported doc.
        </motion.div>
      ) : null}
    </div>
  )
}
