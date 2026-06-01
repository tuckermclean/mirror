import { describe, it, expect } from "vitest";
import { UnknownModelError, ConfigurationError } from "@/lib/errors";

describe("UnknownModelError", () => {
  it("is instanceof UnknownModelError", () => {
    const err = new UnknownModelError("gpt-4");
    expect(err).toBeInstanceOf(UnknownModelError);
  });

  it("is instanceof Error", () => {
    const err = new UnknownModelError("gpt-4");
    expect(err).toBeInstanceOf(Error);
  });

  it("exposes the model name", () => {
    const err = new UnknownModelError("gpt-4");
    expect(err.model).toBe("gpt-4");
  });

  it("has name UnknownModelError", () => {
    const err = new UnknownModelError("gpt-4");
    expect(err.name).toBe("UnknownModelError");
  });
});

describe("ConfigurationError", () => {
  it("is instanceof ConfigurationError", () => {
    const err = new ConfigurationError("missing INNGEST_SIGNING_KEY");
    expect(err).toBeInstanceOf(ConfigurationError);
  });

  it("is instanceof Error", () => {
    const err = new ConfigurationError("missing INNGEST_SIGNING_KEY");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name ConfigurationError", () => {
    const err = new ConfigurationError("missing INNGEST_SIGNING_KEY");
    expect(err.name).toBe("ConfigurationError");
  });

  it("exposes the message", () => {
    const err = new ConfigurationError("missing INNGEST_SIGNING_KEY");
    expect(err.message).toBe("missing INNGEST_SIGNING_KEY");
  });
});
