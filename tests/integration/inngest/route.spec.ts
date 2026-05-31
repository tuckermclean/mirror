/**
 * Integration test for GET /api/inngest — no mocks, real Inngest SDK.
 *
 * Catches the class of bug from PR #22: Inngest serve() returning 500 when
 * INNGEST_SIGNING_KEY is absent in cloud mode. By importing the real handler
 * and calling it directly (no vi.mock("inngest")), any SDK runtime error
 * surfaces here rather than being hidden behind a mock.
 *
 * Run with: pnpm test:integration (no DATABASE_URL required)
 */
import { describe, it, expect } from "vitest";

describe("GET /api/inngest — integration (real Inngest SDK, no mocks)", () => {
  it("responds with status < 500 when no signing key is configured", async () => {
    const { GET } = await import("@/app/api/inngest/route");
    const req = new Request("http://localhost/api/inngest");
    const response = await GET(req);

    expect(response.status).toBeLessThan(500);
  });

  it("responds with a JSON content-type", async () => {
    const { GET } = await import("@/app/api/inngest/route");
    const req = new Request("http://localhost/api/inngest");
    const response = await GET(req);

    const contentType = response.headers.get("content-type") ?? "";
    expect(contentType).toMatch(/application\/json/i);
  });

  it("response body is valid JSON", async () => {
    const { GET } = await import("@/app/api/inngest/route");
    const req = new Request("http://localhost/api/inngest");
    const response = await GET(req);

    // Should not throw
    const body = await response.json();
    expect(body).toBeTruthy();
  });
});
