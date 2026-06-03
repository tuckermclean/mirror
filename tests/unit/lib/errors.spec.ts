import { describe, it, expect } from "vitest";
import { UnknownModelError, ConfigurationError, ParseError, MonthlyCapError, StorageError } from "@/lib/errors";

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

describe("ParseError", () => {
  it("is instanceof ParseError", () => {
    expect(new ParseError("bad JSON")).toBeInstanceOf(ParseError);
  });

  it("is instanceof Error", () => {
    expect(new ParseError("bad JSON")).toBeInstanceOf(Error);
  });

  it("has name ParseError", () => {
    expect(new ParseError("bad JSON").name).toBe("ParseError");
  });

  it("exposes the message", () => {
    expect(new ParseError("bad JSON").message).toBe("bad JSON");
  });
});

describe("MonthlyCapError", () => {
  it("is instanceof MonthlyCapError", () => {
    expect(new MonthlyCapError("2026-07-01")).toBeInstanceOf(MonthlyCapError);
  });

  it("is instanceof Error", () => {
    expect(new MonthlyCapError("2026-07-01")).toBeInstanceOf(Error);
  });

  it("has name MonthlyCapError", () => {
    expect(new MonthlyCapError("2026-07-01").name).toBe("MonthlyCapError");
  });

  it("exposes resetsAt", () => {
    expect(new MonthlyCapError("2026-07-01").resetsAt).toBe("2026-07-01");
  });

  it("message contains monthly_cap_reached", () => {
    expect(new MonthlyCapError("2026-07-01").message).toContain("monthly_cap_reached");
  });
});

describe("StorageError", () => {
  it("is instanceof StorageError", () => {
    expect(new StorageError("key not found")).toBeInstanceOf(StorageError);
  });

  it("is instanceof Error", () => {
    expect(new StorageError("key not found")).toBeInstanceOf(Error);
  });

  it("has name StorageError", () => {
    expect(new StorageError("key not found").name).toBe("StorageError");
  });

  it("exposes the message", () => {
    expect(new StorageError("key not found").message).toBe("key not found");
  });
});
