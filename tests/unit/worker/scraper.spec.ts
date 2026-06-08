/**
 * Unit tests for worker/scraper.js and worker/crypto.js
 *
 * Tests run in Node — Playwright is mocked so no real browser is launched.
 * libsodium is used directly for the crypto round-trip tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// crypto.js — decryptCookie
// ---------------------------------------------------------------------------

describe("worker/crypto — decryptCookie", () => {
  const VALID_KEY = "0000000000000000000000000000000000000000000000000000000000000001";

  beforeEach(() => {
    vi.resetModules();
    process.env["COOKIE_ENCRYPTION_KEY"] = VALID_KEY;
  });

  afterEach(() => {
    delete process.env["COOKIE_ENCRYPTION_KEY"];
  });

  it("throws when COOKIE_ENCRYPTION_KEY is missing", async () => {
    delete process.env["COOKIE_ENCRYPTION_KEY"];
    const { decryptCookie } = await import("../../../worker/crypto.js");
    await expect(decryptCookie("dGVzdA")).rejects.toThrow(/COOKIE_ENCRYPTION_KEY/);
  });

  it("throws when ciphertext is too short to contain a header", async () => {
    const { decryptCookie } = await import("../../../worker/crypto.js");
    const tooShort = Buffer.from("short").toString("base64url");
    await expect(decryptCookie(tooShort)).rejects.toThrow();
  });

  it("throws on tampered ciphertext (bad MAC)", async () => {
    const sodium = await import("libsodium-wrappers");
    await sodium.default.ready;
    const key = Buffer.from(VALID_KEY, "hex");
    const { state, header } =
      sodium.default.crypto_secretstream_xchacha20poly1305_init_push(key);
    const msg = Buffer.from("li_at=test");
    const cipher = sodium.default.crypto_secretstream_xchacha20poly1305_push(
      state,
      msg,
      null,
      sodium.default.crypto_secretstream_xchacha20poly1305_TAG_FINAL
    );
    const combined = Buffer.concat([header, cipher]);
    // Corrupt the last 4 bytes to break the MAC
    combined[combined.length - 1] ^= 0xff;
    combined[combined.length - 2] ^= 0xff;
    const tampered = combined.toString("base64url");

    const { decryptCookie } = await import("../../../worker/crypto.js");
    await expect(decryptCookie(tampered)).rejects.toThrow(/decrypt/i);
  });

  it("decrypts a valid secretstream ciphertext produced by libsodium", async () => {
    const sodium = await import("libsodium-wrappers");
    await sodium.default.ready;
    const key = Buffer.from(VALID_KEY, "hex");
    const { state, header } =
      sodium.default.crypto_secretstream_xchacha20poly1305_init_push(key);
    const plaintext = "li_at=AQEDATexample";
    const msg = Buffer.from(plaintext);
    const cipher = sodium.default.crypto_secretstream_xchacha20poly1305_push(
      state,
      msg,
      null,
      sodium.default.crypto_secretstream_xchacha20poly1305_TAG_FINAL
    );
    const combined = Buffer.concat([header, cipher]);
    const cipherB64 = combined.toString("base64url");

    const { decryptCookie } = await import("../../../worker/crypto.js");
    const result = await decryptCookie(cipherB64);
    expect(result).toBe(plaintext);
  });
});

// ---------------------------------------------------------------------------
// scraper.js — scrapeLinkedInProfile
//
// Playwright is mocked at module level. We do NOT call vi.resetModules()
// in beforeEach because that would destroy the playwright mock registration.
// Instead each test gets fresh mock call counts via mockClear() and we
// override mockResolvedValue per test for scenario-specific behaviour.
// ---------------------------------------------------------------------------

const mockContextClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGoto = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockWaitForSelector = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockPageClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBrowserClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// Mutable fixture so individual tests can override it
const fixture = {
  evaluate: () =>
    Promise.resolve({
      name: "Jane Doe",
      headline: "Senior Engineer at ACME",
      about: "I build things.",
      experience: [
        {
          title: "Senior Engineer",
          company: "ACME Corp",
          dates: "Jan 2020 – Present",
          bullets: ["Led platform team"],
        },
      ],
      skills: ["TypeScript", "React"],
    }),
};

const mockEvaluate = vi.hoisted(() =>
  vi.fn().mockImplementation(() => fixture.evaluate())
);

const mockAddCookies = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockNewPage = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    goto: mockGoto,
    waitForSelector: mockWaitForSelector,
    evaluate: mockEvaluate,
    close: mockPageClose,
  })
);
const mockNewContext = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    addCookies: mockAddCookies,
    newPage: mockNewPage,
    close: mockContextClose,
  })
);
const mockLaunch = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    newContext: mockNewContext,
    close: mockBrowserClose,
  })
);

vi.mock("playwright", () => ({
  chromium: { launch: mockLaunch },
}));

describe("worker/scraper — scrapeLinkedInProfile", () => {
  // Capture stdout writes to check cookie is never logged
  let stdoutLines: string[] = [];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    // Reset call counts but preserve mock implementations
    mockLaunch.mockClear();
    mockNewContext.mockClear();
    mockAddCookies.mockClear();
    mockNewPage.mockClear();
    mockGoto.mockClear();
    mockWaitForSelector.mockClear();
    mockEvaluate.mockClear();
    mockPageClose.mockClear();
    mockContextClose.mockClear();
    mockBrowserClose.mockClear();

    // Restore mocks to working defaults
    mockLaunch.mockResolvedValue({
      newContext: mockNewContext,
      close: mockBrowserClose,
    });
    mockNewContext.mockResolvedValue({
      addCookies: mockAddCookies,
      newPage: mockNewPage,
      close: mockContextClose,
    });
    mockGoto.mockResolvedValue(undefined);
    mockEvaluate.mockImplementation(() => fixture.evaluate());

    // Restore default fixture
    fixture.evaluate = () =>
      Promise.resolve({
        name: "Jane Doe",
        headline: "Senior Engineer at ACME",
        about: "I build things.",
        experience: [
          {
            title: "Senior Engineer",
            company: "ACME Corp",
            dates: "Jan 2020 – Present",
            bullets: ["Led platform team"],
          },
        ],
        skills: ["TypeScript", "React"],
      });

    // Capture stdout
    stdoutLines = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
      stdoutLines.push(String(chunk));
      return originalWrite(chunk as Parameters<typeof originalWrite>[0], ...(args as Parameters<typeof originalWrite>[1][]));
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it("launches chromium headless and navigates to the profile URL", async () => {
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await scrapeLinkedInProfile(
      "https://www.linkedin.com/in/janedoe",
      "li_at=session_token"
    );
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true })
    );
    expect(mockGoto).toHaveBeenCalledWith(
      "https://www.linkedin.com/in/janedoe",
      expect.any(Object)
    );
  });

  it("sets the li_at session cookie on the LinkedIn domain", async () => {
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await scrapeLinkedInProfile(
      "https://www.linkedin.com/in/janedoe",
      "li_at=mysession"
    );
    expect(mockAddCookies).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "li_at",
          value: "mysession",
          domain: ".linkedin.com",
          path: "/",
        }),
      ])
    );
  });

  it("extracts name, headline, about, experience, and skills from the page", async () => {
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    const result = await scrapeLinkedInProfile(
      "https://www.linkedin.com/in/janedoe",
      "li_at=mysession"
    );
    expect(result.name).toBe("Jane Doe");
    expect(result.headline).toBe("Senior Engineer at ACME");
    expect(result.about).toBe("I build things.");
    expect(Array.isArray(result.experience)).toBe(true);
    expect((result.experience as Array<{company: string}>)[0].company).toBe("ACME Corp");
    expect(Array.isArray(result.skills)).toBe(true);
    expect(result.skills as string[]).toContain("TypeScript");
  });

  it("closes the browser context and browser after scraping (cookie cleared from memory)", async () => {
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await scrapeLinkedInProfile(
      "https://www.linkedin.com/in/janedoe",
      "li_at=mysession"
    );
    expect(mockContextClose).toHaveBeenCalled();
    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("NEVER logs the session cookie value in any output", async () => {
    const bareToken = "super_secret_session_xyz_12345";
    const sensitiveToken = `li_at=${bareToken}`;
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await scrapeLinkedInProfile(
      "https://www.linkedin.com/in/janedoe",
      sensitiveToken
    );
    const allOutput = stdoutLines.join("\n");
    // The full name=value header form must never appear in logs...
    expect(allOutput).not.toContain(sensitiveToken);
    // ...nor the bare token value on its own (the scraper strips the
    // "li_at=" prefix before handing it to Playwright, so guard the
    // stripped form separately).
    expect(allOutput).not.toContain(bareToken);
  });

  it("throws a descriptive error when page navigation fails", async () => {
    mockGoto.mockRejectedValueOnce(new Error("net::ERR_NAME_NOT_RESOLVED"));
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await expect(
      scrapeLinkedInProfile("https://www.linkedin.com/in/nobody", "li_at=tok")
    ).rejects.toThrow(/failed to load/i);
  });

  it("throws when page.evaluate signals an auth wall or error", async () => {
    mockEvaluate.mockRejectedValueOnce(new Error("auth_wall_detected"));
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await expect(
      scrapeLinkedInProfile("https://www.linkedin.com/in/someone", "li_at=expired")
    ).rejects.toThrow();
  });

  it("closes browser and context even when page navigation throws", async () => {
    mockGoto.mockRejectedValueOnce(new Error("net::ERR_NAME_NOT_RESOLVED"));
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await scrapeLinkedInProfile(
      "https://www.linkedin.com/in/nobody",
      "li_at=tok"
    ).catch(() => undefined);
    expect(mockContextClose).toHaveBeenCalled();
    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("throws AuthWallError when both name and headline are empty (expired cookie / login redirect)", async () => {
    // Simulate LinkedIn returning the login page — h1 may exist but name/headline
    // will be empty because the user is not authenticated.
    fixture.evaluate = () =>
      Promise.resolve({
        name: "",
        headline: "",
        about: "",
        experience: [],
        skills: [],
      });
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await expect(
      scrapeLinkedInProfile(
        "https://www.linkedin.com/in/janedoe",
        "li_at=expired-token"
      )
    ).rejects.toThrow(/auth.wall|AuthWall|expired|authentication/i);
  });
  // B-2: null sessionCookie path — addCookies must NOT be called, public scrape path.
  it("when sessionCookie is null, addCookies is NOT called (public browsing path)", async () => {
    const { scrapeLinkedInProfile } = await import("../../../worker/scraper.js");
    await scrapeLinkedInProfile(
      "https://www.linkedin.com/in/publicuser",
      null
    );
    expect(mockAddCookies).not.toHaveBeenCalled();
  });

});
