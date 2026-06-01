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
