import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warn() calls console.warn with structured output", () => {
    logger.warn("fallback email used", { clerkUserId: "user_abc" });
    expect(console.warn).toHaveBeenCalledOnce();
    const call = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(call);
    expect(parsed.level).toBe("warn");
    expect(parsed.msg).toBe("fallback email used");
    expect(parsed.clerkUserId).toBe("user_abc");
  });

  it("warn() works with no metadata", () => {
    logger.warn("something happened");
    expect(console.warn).toHaveBeenCalledOnce();
    const call = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(call);
    expect(parsed.level).toBe("warn");
    expect(parsed.msg).toBe("something happened");
  });

  it("error() calls console.error with level=error", () => {
    logger.error("something broke", { code: 500 });
    expect(console.error).toHaveBeenCalledOnce();
    const call = (console.error as ReturnType<typeof vi.spyOn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(call);
    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("something broke");
    expect(parsed.code).toBe(500);
  });
});
