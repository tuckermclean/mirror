import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  voiceMatchView,
  VoiceMatchBadgeView,
  type VoiceMatchState,
} from "../../../extension/components/VoiceMatchBadge";

describe("voiceMatchView — maps state to display copy", () => {
  it("renders the score on a successful (200) result", () => {
    const view = voiceMatchView({
      status: "ok",
      score: 87,
      components: { cosine: 0.82, feature: 0.91 },
    });
    expect(view.tone).toBe("score");
    expect(view.scoreLabel).toBe("87");
    expect(view.headline).toMatch(/voice match/i);
  });

  it("shows a loading state", () => {
    const view = voiceMatchView({ status: "loading" });
    expect(view.tone).toBe("loading");
    expect(view.body).toMatch(/checking|loading|measuring/i);
  });

  it("401 → prompts the user to sign in", () => {
    const view = voiceMatchView({ status: "error", code: 401 });
    expect(view.tone).toBe("info");
    expect(view.body).toMatch(/sign in/i);
  });

  it("402 → explains the monthly cap, no alarm", () => {
    const view = voiceMatchView({ status: "error", code: 402 });
    expect(view.body).toMatch(/at this month'?s cap/i);
  });

  it("409 → tells the user to complete their interview", () => {
    const view = voiceMatchView({ status: "error", code: 409 });
    expect(view.body).toMatch(/complete your interview/i);
  });

  it("404 → explains there is no Mirror account yet", () => {
    const view = voiceMatchView({ status: "error", code: 404 });
    expect(view.body).toMatch(/no mirror account|haven'?t signed up|account/i);
  });

  it("400 and network errors → a generic, non-scary fallback", () => {
    expect(voiceMatchView({ status: "error", code: 400 }).body).toMatch(
      /couldn'?t|try again|something/i,
    );
    expect(voiceMatchView({ status: "error", code: "network" }).body).toMatch(
      /couldn'?t|offline|connection|try again/i,
    );
  });
});

describe("VoiceMatchBadgeView — renders each state to markup", () => {
  function html(state: VoiceMatchState): string {
    return renderToStaticMarkup(React.createElement(VoiceMatchBadgeView, { state }));
  }

  it("renders the numeric score on 200", () => {
    const markup = html({
      status: "ok",
      score: 87,
      components: { cosine: 0.82, feature: 0.91 },
    });
    expect(markup).toContain("87");
    expect(markup.toLowerCase()).toContain("voice match");
  });

  it("renders the sign-in fallback on 401", () => {
    expect(html({ status: "error", code: 401 }).toLowerCase()).toContain("sign in");
  });

  it("renders the cap fallback on 402", () => {
    // React escapes the apostrophe in the rendered markup (&#x27;), so assert on
    // the apostrophe-free fragments of the cap copy.
    const markup = html({ status: "error", code: 402 }).toLowerCase();
    expect(markup).toContain("this month");
    expect(markup).toContain("cap");
  });

  it("renders the interview fallback on 409", () => {
    expect(html({ status: "error", code: 409 }).toLowerCase()).toContain(
      "complete your interview",
    );
  });
});
