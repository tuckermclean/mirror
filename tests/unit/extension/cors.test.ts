import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  corsHeaders,
  resolveAllowedOrigin,
} from "@/lib/extension/cors";

// Helpers to manipulate process.env safely within tests.
const originalEnv = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

beforeEach(() => {
  // Start every test from a clean baseline (no allow-list, non-production).
  delete process.env["EXTENSION_ALLOWED_ORIGINS"];
  process.env["NODE_ENV"] = "test";
});

afterEach(() => {
  // Restore original environment so tests don't bleed into each other.
  Object.assign(process.env, originalEnv);
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
});

// A well-formed extension origin (32 lowercase a-p chars after the scheme).
const EXT_A = "chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh";
const EXT_B = "chrome-extension://ppppooooaaaabbbbccccddddeeeefffff".slice(
  0,
  // Just ensuring it is the correct length (32 chars after the scheme segment).
  "chrome-extension://".length + 32
);

describe("resolveAllowedOrigin — EXTENSION_ALLOWED_ORIGINS allow-list branch", () => {
  beforeEach(() => {
    setEnv({ EXTENSION_ALLOWED_ORIGINS: `${EXT_A},${EXT_B}` });
  });

  it("reflects back a matching origin from the allow-list", () => {
    expect(resolveAllowedOrigin(EXT_A)).toBe(EXT_A);
  });

  it("reflects back the second allowed origin", () => {
    expect(resolveAllowedOrigin(EXT_B)).toBe(EXT_B);
  });

  it("returns null for an origin NOT in the allow-list", () => {
    const other = "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
    expect(resolveAllowedOrigin(other)).toBeNull();
  });

  it("returns null for a non-extension origin even if allow-list is set", () => {
    expect(resolveAllowedOrigin("https://evil.com")).toBeNull();
  });

  it("trims whitespace around comma-separated origins", () => {
    setEnv({ EXTENSION_ALLOWED_ORIGINS: ` ${EXT_A} , ${EXT_B} ` });
    expect(resolveAllowedOrigin(EXT_A)).toBe(EXT_A);
  });
});

describe("resolveAllowedOrigin — production fail-closed (no allow-list configured)", () => {
  beforeEach(() => {
    setEnv({ NODE_ENV: "production", EXTENSION_ALLOWED_ORIGINS: undefined });
  });

  it("returns null for a valid chrome-extension origin in production (fail-closed)", () => {
    expect(resolveAllowedOrigin(EXT_A)).toBeNull();
  });

  it("returns null for any origin in production when no allow-list is set", () => {
    expect(resolveAllowedOrigin("https://mirror.app")).toBeNull();
  });

  it("returns null for a null origin in production", () => {
    expect(resolveAllowedOrigin(null)).toBeNull();
  });
});

describe("resolveAllowedOrigin — non-production fallback (no allow-list configured)", () => {
  beforeEach(() => {
    setEnv({ NODE_ENV: "test", EXTENSION_ALLOWED_ORIGINS: undefined });
  });

  it("reflects a well-formed chrome-extension origin in non-production", () => {
    expect(resolveAllowedOrigin(EXT_A)).toBe(EXT_A);
  });

  it("returns null for a non-extension origin in non-production", () => {
    expect(resolveAllowedOrigin("https://attacker.com")).toBeNull();
  });

  it("returns null for a null origin", () => {
    expect(resolveAllowedOrigin(null)).toBeNull();
  });

  it("returns null for a malformed extension origin (wrong length)", () => {
    // Origin has < 32 chars after the scheme segment.
    expect(resolveAllowedOrigin("chrome-extension://tooshort")).toBeNull();
  });

  it("returns null for a malformed extension origin (invalid chars — 'q' is not in a-p)", () => {
    const badOrigin = "chrome-extension://qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    expect(resolveAllowedOrigin(badOrigin)).toBeNull();
  });
});

describe("resolveAllowedOrigin — allowlist validation rejects non-extension configured origins", () => {
  it("returns null when EXTENSION_ALLOWED_ORIGINS contains a plain web origin (not reflected)", () => {
    setEnv({ EXTENSION_ALLOWED_ORIGINS: "https://attacker.com" });
    expect(resolveAllowedOrigin("https://attacker.com")).toBeNull();
  });

  it("still reflects valid extension origins when the list contains a mix of valid and invalid entries", () => {
    setEnv({
      EXTENSION_ALLOWED_ORIGINS: `https://attacker.com,${EXT_A}`,
    });
    expect(resolveAllowedOrigin(EXT_A)).toBe(EXT_A);
    expect(resolveAllowedOrigin("https://attacker.com")).toBeNull();
  });

  it("returns null when the configured origin has invalid extension ID chars (not a-p)", () => {
    const badExtOrigin =
      "chrome-extension://qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    setEnv({ EXTENSION_ALLOWED_ORIGINS: badExtOrigin });
    expect(resolveAllowedOrigin(badExtOrigin)).toBeNull();
  });

  it("returns null when the configured origin has a too-short extension ID", () => {
    const shortExtOrigin = "chrome-extension://tooshort";
    setEnv({ EXTENSION_ALLOWED_ORIGINS: shortExtOrigin });
    expect(resolveAllowedOrigin(shortExtOrigin)).toBeNull();
  });
});

describe("corsHeaders — with a valid allowed origin", () => {
  beforeEach(() => {
    setEnv({
      NODE_ENV: "test",
      EXTENSION_ALLOWED_ORIGINS: undefined,
    });
  });

  it("returns the expected CORS header set for an allowed origin", () => {
    const headers = corsHeaders(EXT_A);
    expect(headers["Access-Control-Allow-Origin"]).toBe(EXT_A);
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(headers["Vary"]).toBe("Origin");
  });

  it("never returns a wildcard origin", () => {
    const headers = corsHeaders(EXT_A);
    expect(headers["Access-Control-Allow-Origin"]).not.toBe("*");
  });
});

describe("corsHeaders — with a disallowed or null origin", () => {
  it("returns an empty object for a non-extension origin (no CORS headers emitted)", () => {
    const headers = corsHeaders("https://evil.com");
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it("returns an empty object for null (no Origin header sent)", () => {
    const headers = corsHeaders(null);
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it("returns an empty object in production with no allow-list (fail-closed)", () => {
    setEnv({ NODE_ENV: "production", EXTENSION_ALLOWED_ORIGINS: undefined });
    const headers = corsHeaders(EXT_A);
    expect(Object.keys(headers)).toHaveLength(0);
  });
});
