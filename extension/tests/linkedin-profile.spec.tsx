/**
 * Unit tests for LinkedInProfileOverlay — SPA navigation re-read logic and
 * clearTimeout cleanup on unmount.
 *
 * Mocking strategy:
 *   - `../lib/dom-reader` — controlled return values for readProfile / profileToText
 *   - `../components/VoiceMatchBadge.live` — a lightweight stub to avoid framer-motion
 *   - `plasmo` — module contains only type exports; mocked as an empty object
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

// ---- Mocks (must be declared before the component import) -------------------

vi.mock("../lib/dom-reader", () => ({
  readProfile: vi.fn(() => ({ headline: "Test Headline", about: "", experience: [] })),
  profileToText: vi.fn(() => "Test Headline"),
}));

vi.mock("../components/VoiceMatchBadge.live", () => ({
  VoiceMatchBadge: ({ profileText }: { profileText: string }) => (
    <div data-testid="badge">{profileText}</div>
  ),
}));

// Plasmo is only peer-dep / build-time tooling; its types don't exist in test.
vi.mock("plasmo", () => ({}));

// ---- Component import (after mocks) -----------------------------------------

import LinkedInProfileOverlay from "../contents/linkedin-profile";
import { readProfile, profileToText } from "../lib/dom-reader";

// ---- Typed mock helpers ------------------------------------------------------

const mockReadProfile = readProfile as ReturnType<typeof vi.fn>;
const mockProfileToText = profileToText as ReturnType<typeof vi.fn>;

// =============================================================================

describe("LinkedInProfileOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReadProfile.mockClear();
    mockProfileToText.mockClear();
    // Default: /in/alice path so the component mounts on a profile page.
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, pathname: "/in/alice" },
    });
    // Reset profileToText to return the initial profile text.
    mockProfileToText.mockReturnValue("Alice Profile Text");
  });

  afterEach(() => {
    vi.useRealTimers();
    // No explicit unmount needed: React Testing Library auto-cleanup runs after
    // each test, unmounting any rendered component — which triggers the
    // component's own effect cleanup that restores the patched history methods.
  });

  // ---------------------------------------------------------------------------
  it("reads the initial profile text on mount", () => {
    mockProfileToText.mockReturnValue("Initial Profile Text");

    const { getByTestId } = render(<LinkedInProfileOverlay />);

    // The badge should be rendered with the initial text.
    expect(getByTestId("badge").textContent).toBe("Initial Profile Text");
    // profileToText is invoked during useState initializer.
    expect(mockProfileToText).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  it("re-reads the profile after pushState navigates to a /in/ path", async () => {
    mockProfileToText.mockReturnValue("Bob Profile Text");

    render(<LinkedInProfileOverlay />);
    const callsBefore = mockReadProfile.mock.calls.length;

    // Simulate navigation to another /in/ profile.
    await act(async () => {
      Object.defineProperty(window, "location", {
        writable: true,
        value: { ...window.location, pathname: "/in/bob" },
      });
      history.pushState({}, "", "/in/bob");
    });

    // Timer has not fired yet — readProfile call count should be unchanged.
    expect(mockReadProfile.mock.calls.length).toBe(callsBefore);

    // Advance fake timers past the 500ms delay.
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // readProfile should have been called at least once more.
    expect(mockReadProfile.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // ---------------------------------------------------------------------------
  it("re-reads the profile after replaceState navigates to a /in/ path", async () => {
    mockProfileToText.mockReturnValue("Dave Profile Text");

    render(<LinkedInProfileOverlay />);
    const callsBefore = mockReadProfile.mock.calls.length;

    // Simulate an in-place SPA navigation via replaceState (LinkedIn uses both
    // pushState and replaceState; the component patches both).
    await act(async () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { ...window.location, pathname: "/in/dave" },
      });
      history.replaceState({}, "", "/in/dave");
    });

    // Timer has not fired yet — readProfile call count should be unchanged.
    expect(mockReadProfile.mock.calls.length).toBe(callsBefore);

    // Advance fake timers past the 500ms delay.
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // readProfile should have been called at least once more.
    expect(mockReadProfile.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // ---------------------------------------------------------------------------
  it("re-reads the profile after popstate on a /in/ path", async () => {
    mockProfileToText.mockReturnValue("Alice Profile Text");

    render(<LinkedInProfileOverlay />);
    const callsBefore = mockReadProfile.mock.calls.length;

    await act(async () => {
      Object.defineProperty(window, "location", {
        writable: true,
        value: { ...window.location, pathname: "/in/alice" },
      });
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });

    // Before the delay fires — no extra read.
    expect(mockReadProfile.mock.calls.length).toBe(callsBefore);

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(mockReadProfile.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // ---------------------------------------------------------------------------
  it("does NOT re-read when navigating to a non-/in/ path", async () => {
    render(<LinkedInProfileOverlay />);
    const callsBefore = mockReadProfile.mock.calls.length;

    await act(async () => {
      Object.defineProperty(window, "location", {
        writable: true,
        value: { ...window.location, pathname: "/jobs/123" },
      });
      history.pushState({}, "", "/jobs/123");
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // readProfile must NOT have been called again.
    expect(mockReadProfile.mock.calls.length).toBe(callsBefore);
  });

  // ---------------------------------------------------------------------------
  it("clears the timer on unmount — no state update after unmount", async () => {
    // Arrange: start on a /in/ path.
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, pathname: "/in/carol" },
    });
    mockProfileToText.mockReturnValue("Carol Profile Text");

    const { unmount } = render(<LinkedInProfileOverlay />);
    const callsBefore = mockReadProfile.mock.calls.length;

    // Act: trigger pushState (starts the 500ms timer), then immediately unmount.
    await act(async () => {
      history.pushState({}, "", "/in/carol");
    });

    // Unmount BEFORE the 500ms timer fires.
    unmount();

    // Advance timers past the delay — the callback should be cancelled.
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // readProfile must NOT have been called after unmount.
    expect(mockReadProfile.mock.calls.length).toBe(callsBefore);
  });
});
