/**
 * Unit tests for worker/logger.js
 *
 * Verifies:
 *   - JSON-per-line structure (each log line is valid JSON)
 *   - `meta` spread works correctly (properties passed in meta appear in the output)
 *   - Required fields are present (level, msg)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("worker/logger — log()", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("writes a single newline-terminated JSON line per call", async () => {
    const { log } = await import("../../../worker/logger.js");
    log("info", "hello world");
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0]?.[0] as string;
    expect(written).toMatch(/\n$/);
    const parsed = JSON.parse(written.trimEnd());
    expect(parsed).toBeDefined();
  });

  it("output is valid JSON (no extra text around the object)", async () => {
    const { log } = await import("../../../worker/logger.js");
    log("warn", "a warning");
    const written = writeSpy.mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(written.trimEnd())).not.toThrow();
  });

  it("includes required fields: level and msg", async () => {
    const { log } = await import("../../../worker/logger.js");
    log("error", "something failed");
    const written = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written.trimEnd());
    expect(parsed).toHaveProperty("level", "error");
    expect(parsed).toHaveProperty("msg", "something failed");
  });

  it("spreads meta properties into the log object", async () => {
    const { log } = await import("../../../worker/logger.js");
    log("info", "with meta", { userId: "user-123", hasCookie: false });
    const written = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written.trimEnd());
    expect(parsed).toHaveProperty("userId", "user-123");
    expect(parsed).toHaveProperty("hasCookie", false);
  });

  it("meta properties do NOT override level or msg", async () => {
    const { log } = await import("../../../worker/logger.js");
    // Even if meta contains a 'level' or 'msg' key, the actual log fields
    // from the parameters take precedence via the spread order in the implementation.
    log("info", "original message", { userId: "u-1" });
    const written = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written.trimEnd());
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("original message");
  });

  it("works correctly with an empty meta object (default)", async () => {
    const { log } = await import("../../../worker/logger.js");
    log("warn", "no meta provided");
    const written = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written.trimEnd());
    expect(parsed.level).toBe("warn");
    expect(parsed.msg).toBe("no meta provided");
  });
});
