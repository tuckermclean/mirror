/**
 * worker/inngest-client.js — shared Inngest client for the Playwright worker
 *
 * A single instance is exported and imported by both worker/index.js (serve)
 * and worker/inngest-functions.js (function definitions + step.sendEvent).
 * Using two separate instances risks credential drift in production.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "mirror",
  ...(process.env["INNGEST_EVENT_KEY"]
    ? { eventKey: process.env["INNGEST_EVENT_KEY"] }
    : {}),
  ...(process.env["INNGEST_SIGNING_KEY"]
    ? { signingKey: process.env["INNGEST_SIGNING_KEY"] }
    : { isDev: true }),
});
