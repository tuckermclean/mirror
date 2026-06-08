import { describe, it, expect } from "vitest";
import { isScrolledToEnd } from "@/components/walkthrough/scroll-unlock";

describe("isScrolledToEnd", () => {
  it("is false at the very top of a long page", () => {
    expect(isScrolledToEnd({ scrollTop: 0, clientHeight: 800, scrollHeight: 4000 })).toBe(false);
  });

  it("is true when scrolled to the absolute bottom", () => {
    expect(isScrolledToEnd({ scrollTop: 3200, clientHeight: 800, scrollHeight: 4000 })).toBe(true);
  });

  it("is true within the default tolerance of the bottom", () => {
    // 3200 is exact bottom; 3180 is 20px short — inside the 24px default tolerance.
    expect(isScrolledToEnd({ scrollTop: 3180, clientHeight: 800, scrollHeight: 4000 })).toBe(true);
  });

  it("is false when more than the tolerance remains", () => {
    expect(isScrolledToEnd({ scrollTop: 3000, clientHeight: 800, scrollHeight: 4000 })).toBe(false);
  });

  it("is true when the content fits entirely in the viewport (nothing to scroll)", () => {
    expect(isScrolledToEnd({ scrollTop: 0, clientHeight: 800, scrollHeight: 700 })).toBe(true);
  });

  it("honours a custom tolerance", () => {
    expect(
      isScrolledToEnd({ scrollTop: 3000, clientHeight: 800, scrollHeight: 4000 }, 250)
    ).toBe(true);
  });
});
