/**
 * Failing tests (TDD Red phase) for:
 *   - Blocker 10: form-missing-aria-invalid-association
 *   - Blocker 11: animatepresence-child-missing-key
 *   - Blocker 12: pdf-input-silently-dropped
 *   - Suggestion 6: submit button label changes not announced to screen readers
 *
 * These are source-inspection tests that verify the required attributes
 * are present in the form component source.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const formSrc = fs.readFileSync(
  path.resolve(__dirname, "../../../src/app/onboarding/linkedin/_form.tsx"),
  "utf-8"
);

describe("LinkedInForm accessibility (Blocker 10)", () => {
  it("has aria-required on the profileUrl input", () => {
    expect(formSrc).toContain('aria-required="true"');
  });

  it("sets aria-invalid on the profileUrl input when error state is present", () => {
    expect(formSrc).toContain("aria-invalid");
  });

  it("sets aria-describedby on the profileUrl input pointing to the error element", () => {
    expect(formSrc).toContain("aria-describedby");
  });

  it("error div has a stable id for aria-describedby association", () => {
    expect(formSrc).toContain('id="error-alert-id"');
  });
});

describe("AnimatePresence key prop (Blocker 11)", () => {
  it("motion.div inside error AnimatePresence has key=\"error-alert\"", () => {
    expect(formSrc).toContain('key="error-alert"');
  });
});

describe("PDF upload user expectation (Blocker 12)", () => {
  it("includes copy that explains the PDF will be processed after LinkedIn connection", () => {
    // Check for some indication the PDF is a separate/later flow
    const hasClarification =
      formSrc.includes("processed after") ||
      formSrc.includes("separate upload") ||
      formSrc.includes("after LinkedIn") ||
      formSrc.includes("processed separately");
    expect(hasClarification).toBe(true);
  });
});

describe("Submit button a11y announcement (Suggestion 6)", () => {
  it("has an aria-live status span for screen reader announcements", () => {
    expect(formSrc).toContain('aria-live="polite"');
  });

  it("has a visually-hidden status span", () => {
    expect(formSrc).toContain("sr-only");
  });
});
