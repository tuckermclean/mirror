import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
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
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (existing.length === 0) {
    const clerkUser = await currentUser();
    const resolvedEmail = clerkUser?.emailAddresses[0]?.emailAddress;
    if (!resolvedEmail) {
      logger.warn({ msg: "Clerk user has no email address; using fallback", clerkUserId });
    }
    const email = resolvedEmail ?? `${clerkUserId}@clerk.test`;
    await db.insert(users).values({ clerkId: clerkUserId, email });
  }

  return (
    <main className="min-h-screen flex flex-col items-center py-12 px-4">
      <h1 className="text-2xl font-semibold mb-8">Your Story</h1>
      <InterviewChat userId={clerkUserId} />
    </main>
  );
}
