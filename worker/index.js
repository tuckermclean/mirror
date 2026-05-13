// Playwright scraper worker — Inngest function host
// Wk 1 stub: starts the process and exposes a /healthz endpoint.
// Full implementation ships in Wk 2 (LinkedIn ingestion layer).

import { createServer } from "node:http";

console.log("worker: starting mirror playwright worker (Wk 1 stub)");

// Minimal HTTP health server so the Docker/Kubernetes healthcheck has a real
// probe target rather than a no-op node -e process.exit(0).
const server = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(2112, () => {
  console.log("worker: health server listening on :2112/healthz");
});

process.on("SIGTERM", () => {
  console.log("worker: received SIGTERM, shutting down");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("worker: received SIGINT, shutting down");
  server.close(() => process.exit(0));
});
