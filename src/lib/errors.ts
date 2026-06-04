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

/** Thrown when an object storage operation fails (R2 / S3). */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
