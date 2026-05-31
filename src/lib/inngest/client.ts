import { Inngest } from "inngest";
import { ConfigurationError } from "@/lib/errors";

// Fail fast: unsigned requests reach this public endpoint once real functions
// are registered, so a missing key in production is a security gap.
if (process.env["NODE_ENV"] === "production" && !process.env["INNGEST_SIGNING_KEY"]) {
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
