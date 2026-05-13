import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import "./globals.css";

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
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
