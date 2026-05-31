import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

// Public webhook — Clerk bypassed in middleware; Inngest signs all inbound requests.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
