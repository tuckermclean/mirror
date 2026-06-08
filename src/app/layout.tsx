import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { headers } from "next/headers";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider } from "@/components/providers/posthog-provider";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

// NOTE(security): PostHog is initialized in PostHogProvider with PII scrubbing
// per THREAT_MODEL.md (maskAllInputs:true, sanitize_properties, no session replay
// by default). CSP connect-src entries for PostHog are in src/middleware.ts.
// When wiring Stripe, never expose the secret key in client-side code — only the
// publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) may reach the browser.

export const metadata: Metadata = {
  title: "Mirror — Rewrite Your LinkedIn in Your Voice",
  description: "Mirror learns who you actually are, then rewrites your LinkedIn profile with measurably better positioning.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? "";

  return (
    <ClerkProvider nonce={nonce}>
      {/* suppressHydrationWarning prevents a React mismatch warning caused by
          next-themes injecting the active-theme class on the client before
          hydration completes. */}
      <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
        <body>
          {/* ThemeProvider must wrap the subtree so useTheme() in sonner.tsx
              can resolve the active theme; without it the Toaster always
              falls back to "system". */}
          <PostHogProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              {children}
              <Toaster />
            </ThemeProvider>
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
