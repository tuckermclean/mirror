import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    // Last value wins for conflicting utilities (tailwind-merge behaviour)
    expect(cn("px-2 px-4")).toBe("px-4");
  });

  it("filters out falsy values", () => {
    // false is passed directly — false && "bg-blue" evaluates before cn sees it
    expect(cn("text-red-500", false)).toBe("text-red-500");
  });

  it("handles undefined and null gracefully", () => {
    expect(cn("base", undefined, null, "extra")).toBe("base extra");
  });

  it("concatenates non-conflicting class names", () => {
    expect(cn("flex", "items-center", "gap-2")).toBe("flex items-center gap-2");
  });
});
