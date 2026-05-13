import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health/(.*)",
  "/api/webhooks/(.*)",
]);

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set(
    "Content-Security-Policy",
    [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}' https://clerk.mirror.so https://*.clerk.accounts.dev`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: https:`,
      `font-src 'self'`,
      `connect-src 'self' https://api.anthropic.com https://clerk.mirror.so https://api.clerk.dev https://*.clerk.accounts.dev https://us.i.posthog.com https://app.posthog.com`,
      `frame-ancestors 'none'`,
    ].join("; ")
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  response.headers.set("X-Nonce", nonce);
  return response;
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Forward nonce to server components via request headers so layout can read
  // it with headers() and pass it to ClerkProvider. Without this, ClerkProvider
  // gets nonce="" and its inline scripts are blocked by our own CSP.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  return applySecurityHeaders(response, nonce);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
