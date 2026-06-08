/**
 * worker/index.js — Mirror Playwright worker entry point (Wk 2)
 *
 * Hosts:
 *   - /healthz            — HTTP health probe (Docker/Kubernetes)
 *   - /api/inngest        — Inngest function serving endpoint
 *
 * The worker decrypts LinkedIn session cookies and runs Playwright scrapes
 * in response to `mirror/linkedin.scrape.requested` Inngest events.
 */

import { createServer } from "node:http";
import { serve } from "inngest/node";
import { inngest } from "./inngest-client.js";
import { scrapeLinkedInProfileFn } from "./inngest-functions.js";

// ---------------------------------------------------------------------------
// Structured logger — JSON to stdout (no console.log in production)
// ---------------------------------------------------------------------------

function log(level, msg, meta = {}) {
  process.stdout.write(JSON.stringify({ level, msg, ...meta }) + "\n");
}

log("info", "worker: mirror playwright worker ready (Wk 2)");

// ---------------------------------------------------------------------------
// Inngest serve handler — registered at /api/inngest
// ---------------------------------------------------------------------------

const inngestHandler = serve({
  client: inngest,
  functions: [scrapeLinkedInProfileFn],
});

// ---------------------------------------------------------------------------
// HTTP server — handles both /healthz and /api/inngest
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  if (req.url === "/healthz" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", worker: "mirror-playwright-wk2" }));
    return;
  }

  if (req.url?.startsWith("/api/inngest")) {
    // Delegate to Inngest's serve handler
    try {
      await inngestHandler(req, res);
    } catch (err) {
      log("error", "worker: inngest handler error", { err: String(err) });
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(2112, () => {
  log("info", "worker: health server listening on :2112/healthz");
  log("info", "worker: inngest endpoint at :2112/api/inngest");
});

process.on("SIGTERM", () => {
  log("info", "worker: received SIGTERM, shutting down");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  log("info", "worker: received SIGINT, shutting down");
  server.close(() => process.exit(0));
});
