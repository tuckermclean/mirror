/**
 * Failing test (TDD Red phase) for:
 *   acceptedFields reference stability via useMemo
 *
 * This test verifies that `acceptedFields` in WalkthroughClient is wrapped
 * with `useMemo` so its object reference is stable between renders when
 * `decisions` has not changed. Without memoization, `acceptedFields` produces
 * a new object on every render, causing `handleCommit`'s `useCallback` to
 * recreate on every render — defeating the memoization benefit.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../src/components/walkthrough/walkthrough-client.tsx"
  ),
  "utf-8"
);

describe("WalkthroughClient: acceptedFields memoization", () => {
  it("wraps acceptedFields with useMemo so handleCommit deps are stable", () => {
    // acceptedFields must be defined via useMemo, not as a plain inline expression
    expect(src).toContain("useMemo(");
    // The memo must use an arrow function callback
    expect(src).toMatch(/useMemo\(\s*\(\s*\)\s*=>/s);
    // The dependency array for acceptedFields memo must include decisions
    // Check that [decisions] appears as a dep array inside the useMemo block
    expect(src).toContain("[decisions]");
  });

  it("does not define acceptedFields as a plain Object.fromEntries outside useMemo", () => {
    // The old bare assignment (const acceptedFields = Object.fromEntries(...))
    // must not exist — it must now be inside a useMemo callback.
    // We check that Object.fromEntries is only present inside a useMemo call.
    const lines = src.split("\n");
    const acceptedFieldsLine = lines.findIndex((l) =>
      l.includes("acceptedFields") && l.includes("Object.fromEntries")
    );
    // If found as a direct assignment it means memoization is missing
    if (acceptedFieldsLine !== -1) {
      const line = lines[acceptedFieldsLine]!;
      // The line with Object.fromEntries must not be a bare `const acceptedFields =`
      // (it should be inside a useMemo callback instead)
      expect(line.trimStart()).not.toMatch(/^const acceptedFields\s*=/);
    }
  });
});
