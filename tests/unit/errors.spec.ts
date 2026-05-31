// Unit tests — typed error classes in src/lib/errors.ts
import { describe, it, expect } from "vitest";
import { ConfigurationError } from "@/lib/errors";

describe("ConfigurationError", () => {
  it("is an instance of Error", () => {
    const err = new ConfigurationError("test message");
    expect(err).toBeInstanceOf(Error);
  });

  it("sets message correctly", () => {
    const err = new ConfigurationError("missing env var");
    expect(err.message).toBe("missing env var");
  });

  it("sets name to ConfigurationError", () => {
    const err = new ConfigurationError("x");
    expect(err.name).toBe("ConfigurationError");
  });
});
