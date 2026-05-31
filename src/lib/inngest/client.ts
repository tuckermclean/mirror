import { Inngest } from "inngest";
import { ConfigurationError } from "@/lib/errors";

// Fail fast at runtime when INNGEST_SIGNING_KEY is absent in production:
// unsigned requests would reach this public endpoint once real functions are
// registered. Excluded during `next build` (NEXT_PHASE=phase-production-build),
// which imports every route module to collect page data — the signing key is a
// runtime secret and is intentionally absent at build time.
if (
  process.env["NEXT_PHASE"] !== "phase-production-build" &&
  process.env["NODE_ENV"] === "production" &&
  !process.env["INNGEST_SIGNING_KEY"]
) {
  throw new ConfigurationError("INNGEST_SIGNING_KEY must be set in production");
}

export const inngest = new Inngest({
  id: "mirror",
  ...(process.env["INNGEST_EVENT_KEY"]
    ? { eventKey: process.env["INNGEST_EVENT_KEY"] }
    : {}),
  ...(process.env["INNGEST_SIGNING_KEY"]
    ? { signingKey: process.env["INNGEST_SIGNING_KEY"] }
    : {}),
});
