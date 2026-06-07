import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { DELETED_PLAN } from "@/lib/db/delete-user";
import { InterviewChat } from "@/components/interview-chat";
import { logger } from "@/lib/logger";

export default async function InterviewPage() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  // Upsert user row on first visit so the chat route never returns user_not_found.
  // In production, a Clerk webhook also fires; this is the optimistic in-band path.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.clerkId, clerkUserId), ne(users.plan, DELETED_PLAN)))
    .limit(1);

  if (existing.length === 0) {
    const clerkUser = await currentUser();
    const rawEmail = clerkUser?.emailAddresses[0]?.emailAddress;
    if (!rawEmail) {
      logger.warn("clerk user has no email address — using fallback", { clerkUserId });
    }
    const email = rawEmail ?? `${clerkUserId}@clerk.test`;
    await db.insert(users).values({ clerkId: clerkUserId, email });
  }

  return (
    <main className="min-h-screen flex flex-col items-center py-12 px-4">
      <h1 className="text-2xl font-semibold mb-8">Your Story</h1>
      <InterviewChat userId={clerkUserId} />
    </main>
  );
}
