import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "mirror",
  ...(process.env["INNGEST_EVENT_KEY"]
    ? { eventKey: process.env["INNGEST_EVENT_KEY"] }
    : {}),
  ...(process.env["INNGEST_SIGNING_KEY"]
    ? { signingKey: process.env["INNGEST_SIGNING_KEY"] }
    // Without a signing key Inngest's serve handler returns 500 in cloud mode
    // (checkModeConfiguration). Force dev mode so /api/inngest responds normally;
    // cloud mode + full signature validation is restored once the key is set.
    : { isDev: true }),
});
