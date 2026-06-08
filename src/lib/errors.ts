/** Discriminated union result type — avoids naked throws in lib functions. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// ---------------------------------------------------------------------------
// VoiceCard parse errors — defined in src/lib/voice-card/errors.ts and
// re-exported here so existing consumers importing from `@/lib/errors`
// (e.g. parse.ts) keep working unchanged.
// ---------------------------------------------------------------------------

export type { VoiceCardParseError } from "@/lib/voice-card/errors";

/** Thrown when a model string is not in the known pricing table. */
export class UnknownModelError extends Error {
  readonly model: string;

  constructor(model: string) {
    super(`Unknown model "${model}" — add it to MODEL_PRICING in cost-guard.ts`);
    this.name = "UnknownModelError";
    this.model = model;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when required configuration (env vars, options) is missing or invalid. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when a file cannot be parsed as a known AI export format. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when an external API call fails (e.g. Anthropic SDK network or status error). */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the monthly LLM spend cap is reached. */
export class MonthlyCapError extends Error {
  readonly resetsAt: string;

  constructor(resetsAt: string) {
    super(`monthly_cap_reached — resets at ${resetsAt}`);
    this.name = "MonthlyCapError";
    this.resetsAt = resetsAt;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an LLM generation response fails the canonical output schema
 * (invalid JSON or schema mismatch). This is a DETERMINISTIC, terminal failure:
 * retrying the same inputs will not fix it, so the Inngest job wraps it in a
 * NonRetriableError rather than burning the retry budget.
 */
export class GenerationSchemaError extends Error {
  constructor(message: string) {
    super(`generation output failed schema validation: ${message}`);
    this.name = "GenerationSchemaError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when an object storage operation fails (R2 / S3). */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when caller-supplied input fails a domain validation rule. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when cookie encryption/decryption fails (bad key, tampered ciphertext, etc.). */
export class CookieEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CookieEncryptionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

