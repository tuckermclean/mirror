import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("info", () => {
    it("writes to stdout", () => {
      logger.info("hello");
      expect(stdoutSpy).toHaveBeenCalledOnce();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("emits valid JSON with level and msg", () => {
      logger.info("test message");
      const raw = String(stdoutSpy.mock.calls[0]![0]);
      const parsed = JSON.parse(raw.trim());
      expect(parsed.level).toBe("info");
      expect(parsed.msg).toBe("test message");
    });

    it("includes ts field as ISO string", () => {
      logger.info("ts check");
      const raw = String(stdoutSpy.mock.calls[0]![0]);
      const parsed = JSON.parse(raw.trim());
      expect(() => new Date(parsed.ts)).not.toThrow();
      expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("merges meta fields into the output", () => {
      logger.info("with meta", { userId: "u1", count: 42 });
      const raw = String(stdoutSpy.mock.calls[0]![0]);
      const parsed = JSON.parse(raw.trim());
      expect(parsed.userId).toBe("u1");
      expect(parsed.count).toBe(42);
    });
  });

  describe("debug", () => {
    it("writes to stdout", () => {
      logger.debug("debugging");
      expect(stdoutSpy).toHaveBeenCalledOnce();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("emits level=debug", () => {
      logger.debug("dbg msg");
      const raw = String(stdoutSpy.mock.calls[0]![0]);
      const parsed = JSON.parse(raw.trim());
      expect(parsed.level).toBe("debug");
    });
  });

  describe("warn", () => {
    it("writes to stderr", () => {
      logger.warn("watch out");
      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it("emits level=warn", () => {
      logger.warn("warn msg");
      const raw = String(stderrSpy.mock.calls[0]![0]);
      const parsed = JSON.parse(raw.trim());
      expect(parsed.level).toBe("warn");
      expect(parsed.msg).toBe("warn msg");
    });
  });

  describe("error", () => {
    it("writes to stderr", () => {
      logger.error("something broke");
      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it("emits level=error with meta", () => {
      logger.error("err msg", { code: 500 });
      const raw = String(stderrSpy.mock.calls[0]![0]);
      const parsed = JSON.parse(raw.trim());
      expect(parsed.level).toBe("error");
      expect(parsed.msg).toBe("err msg");
      expect(parsed.code).toBe(500);
    });
  });

  describe("output format", () => {
    it("terminates each entry with a newline", () => {
      logger.info("newline check");
      const raw = String(stdoutSpy.mock.calls[0]![0]);
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("does not include extra fields when no meta is provided", () => {
      logger.info("no meta");
      const raw = String(stdoutSpy.mock.calls[0]![0]);
      const parsed = JSON.parse(raw.trim());
      expect(Object.keys(parsed)).toEqual(["level", "msg", "ts"]);
    });
  });
});
