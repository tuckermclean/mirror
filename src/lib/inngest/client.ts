import { Inngest } from "inngest";
import { ConfigurationError } from "@/lib/errors";

// Fail fast at runtime when INNGEST_SIGNING_KEY is absent in production.
// Two exclusions keep this from firing in non-deployment contexts:
// - NEXT_PHASE=phase-production-build: `next build` imports every route module
//   to collect page data; the signing key is a runtime secret, absent at build.
// - CI=true: E2E tests run the app in production mode but without all secrets;
//   CI is not a production deployment, so we do not enforce the key there.
if (
  process.env["NEXT_PHASE"] !== "phase-production-build" &&
  process.env["NODE_ENV"] === "production" &&
  !process.env["CI"] &&
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
