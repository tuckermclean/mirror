import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processImport } from "@/inngest/import-process";

// Public webhook — Clerk bypassed in middleware; the SDK verifies signatures on inbound
// requests (Inngest Cloud signs them — the SDK's role is verification, not signing).
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processImport],
});
