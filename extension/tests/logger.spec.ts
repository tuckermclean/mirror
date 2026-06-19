/**
 * Unit tests for extension/lib/logger.ts
 *
 * TDD: these tests were written BEFORE the implementation was reviewed and
 * capture the expected contract of the `logger` singleton:
 *  - every method prefixes the message with "[mirror]"
 *  - an optional `meta` object is forwarded as the third console argument
 *  - when `meta` is omitted an empty object `{}` is forwarded instead
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Shared setup — reset all spies before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// logger.info
// ---------------------------------------------------------------------------

describe("logger.info", () => {
  it("prefixes the message with [mirror]", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("hello world");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("[mirror]");
    expect(spy.mock.calls[0][1]).toBe("hello world");
  });

  it("passes the meta object as the third argument when provided", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const meta = { userId: "u_123", attempt: 2 };
    logger.info("with meta", meta);
    expect(spy.mock.calls[0][2]).toEqual({ userId: "u_123", attempt: 2 });
  });

  it("passes an empty object as the third argument when meta is omitted", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("no meta");
    expect(spy.mock.calls[0][2]).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// logger.warn
// ---------------------------------------------------------------------------

describe("logger.warn", () => {
  it("prefixes the message with [mirror]", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("something odd");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("[mirror]");
    expect(spy.mock.calls[0][1]).toBe("something odd");
  });

  it("passes the meta object as the third argument when provided", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const meta = { retries: 3 };
    logger.warn("retrying", meta);
    expect(spy.mock.calls[0][2]).toEqual({ retries: 3 });
  });

  it("passes an empty object as the third argument when meta is omitted", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("no meta");
    expect(spy.mock.calls[0][2]).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// logger.error
// ---------------------------------------------------------------------------

describe("logger.error", () => {
  it("prefixes the message with [mirror]", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("something broke");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("[mirror]");
    expect(spy.mock.calls[0][1]).toBe("something broke");
  });

  it("passes the meta object as the third argument when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const meta = { code: "ERR_TIMEOUT", url: "/api/foo" };
    logger.error("request failed", meta);
    expect(spy.mock.calls[0][2]).toEqual({ code: "ERR_TIMEOUT", url: "/api/foo" });
  });

  it("passes an empty object as the third argument when meta is omitted", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("no meta");
    expect(spy.mock.calls[0][2]).toEqual({});
  });
});
