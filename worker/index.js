// Playwright scraper worker — Inngest function host
// Wk 1 stub: starts the process, registers with Inngest, and waits for jobs.
// Full implementation ships in Wk 2 (LinkedIn ingestion layer).

console.log("worker: starting mirror playwright worker (Wk 1 stub)");

// In production this file:
//   1. Imports the Inngest client configured with INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY
//   2. Registers Inngest functions (scrapeLinkedInProfile, embedBenchmarkProfile, etc.)
//   3. Starts an HTTP server so Inngest can invoke functions via webhook
//
// For now, keep the process alive so the container healthcheck passes.
process.on("SIGTERM", () => {
  console.log("worker: received SIGTERM, shutting down");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("worker: received SIGINT, shutting down");
  process.exit(0);
});

// Idle loop — replaced by real Inngest serve() in Wk 2
setInterval(() => {}, 30_000);
