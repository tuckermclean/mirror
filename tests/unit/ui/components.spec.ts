import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ─── Export smoke tests ──────────────────────────────────────────────────────
// Verify each shadcn/ui component is importable and is a callable React component.
// Full render/a11y tests for client components (Button, Badge, Separator, Progress,
// Toaster) that rely on @base-ui/react hooks require a jsdom/browser environment
// and will be covered by tests/a11y/ Playwright tests (tracked: issue #6 follow-up).

import CostProgressBar from "@/app/admin/costs/cost-progress-bar";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";

describe("shadcn/ui component exports", () => {
  it("CostProgressBar is a callable React component", () => {
    expect(typeof CostProgressBar).toBe("function");
  });

  it("Badge is a callable React component", () => {
    expect(typeof Badge).toBe("function");
  });

  it("badgeVariants is a callable CVA function", () => {
    expect(typeof badgeVariants).toBe("function");
  });

  it("Button is a callable React component", () => {
    expect(typeof Button).toBe("function");
  });

  it("buttonVariants is a callable CVA function", () => {
    expect(typeof buttonVariants).toBe("function");
  });

  it("Card and sub-components are callable React components", () => {
    expect(typeof Card).toBe("function");
    expect(typeof CardHeader).toBe("function");
    expect(typeof CardTitle).toBe("function");
    expect(typeof CardDescription).toBe("function");
    expect(typeof CardContent).toBe("function");
    expect(typeof CardFooter).toBe("function");
    expect(typeof CardAction).toBe("function");
  });

  it("Progress, ProgressLabel, ProgressValue are callable React components", () => {
    expect(typeof Progress).toBe("function");
    expect(typeof ProgressLabel).toBe("function");
    expect(typeof ProgressValue).toBe("function");
  });

  it("ProgressTrack and ProgressIndicator are NOT exported (prevent double-render)", async () => {
    // These are rendered internally by Progress; exporting them would let callers
    // accidentally pass them as children, silently rendering two tracks.
    const mod = await import("@/components/ui/progress");
    const exportNames = Object.keys(mod);
    expect(exportNames).not.toContain("ProgressTrack");
    expect(exportNames).not.toContain("ProgressIndicator");
  });

  it("Separator is a callable React component", () => {
    expect(typeof Separator).toBe("function");
  });

  it("Toaster is a callable React component", () => {
    expect(typeof Toaster).toBe("function");
  });
});

// ─── CardTitle heading semantics (WCAG AA SC 1.3.1) ──────────────────────────
// Card is a pure React component (no @base-ui hooks at the root level), so we
// can verify its output with renderToStaticMarkup in a Node environment.

describe("CardTitle heading semantics", () => {
  it("renders as <div> by default (decorative/non-landmark uses)", () => {
    const html = renderToStaticMarkup(
      React.createElement(CardTitle, null, "Profile Summary")
    );
    expect(html).toMatch(/^<div/);
    expect(html).toContain('data-slot="card-title"');
  });

  it("renders as <h2> when as='h2' (primary section heading)", () => {
    const html = renderToStaticMarkup(
      React.createElement(CardTitle, { as: "h2" }, "Profile Summary")
    );
    expect(html).toMatch(/^<h2/);
    expect(html).toContain('data-slot="card-title"');
  });

  it("renders as <h1> when as='h1' (page-level heading)", () => {
    const html = renderToStaticMarkup(
      React.createElement(CardTitle, { as: "h1" }, "Page Title")
    );
    expect(html).toMatch(/^<h1/);
  });

  it("forwards className to the rendered element", () => {
    const html = renderToStaticMarkup(
      React.createElement(CardTitle, { className: "custom-class" }, "Title")
    );
    expect(html).toContain("custom-class");
  });
});
