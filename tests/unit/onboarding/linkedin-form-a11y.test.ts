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

describe("PDF upload field removed (Blocker 12)", () => {
  it("does not contain a pdfUpload input field", () => {
    // The PDF field was removed because it silently dropped uploaded files —
    // the pipeline code was never implemented. A follow-up PR will add it
    // properly. Until then the field must not exist in the form.
    expect(formSrc).not.toContain('name="pdfUpload"');
  });

  it("does not contain misleading copy about PDF processing", () => {
    expect(formSrc).not.toContain("processed after LinkedIn connection");
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
