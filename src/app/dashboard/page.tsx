import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, and, isNotNull, count } from "drizzle-orm";
import { db } from "@/db/client";
import { users, interviews, imports } from "@/db/schema";
import { OnboardingSteps } from "@/components/dashboard/onboarding-steps";

export default async function DashboardPage() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  // Upsert user row on first dashboard visit — same optimistic in-band path
  // used by the interview page; the Clerk webhook is the canonical owner.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (existing.length === 0) {
    const clerkUser = await currentUser();
    const email =
      clerkUser?.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@clerk.test`;
    await db.insert(users).values({ clerkId: clerkUserId, email });
  }

  // Re-fetch to get the canonical internal ID (covers both just-inserted and pre-existing).
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!user) redirect("/sign-in");

  const [completedInterview] = await db
    .select({ completedAt: interviews.completedAt })
    .from(interviews)
    .where(
      and(
        eq(interviews.userId, user.id),
        isNotNull(interviews.completedAt)
      )
    )
    .limit(1);

  const [importRow] = await db
    .select({ value: count() })
    .from(imports)
    .where(eq(imports.userId, user.id));

  const importCount = importRow?.value ?? 0;

  return (
    <OnboardingSteps
      step1Complete={!!completedInterview}
      step2Complete={importCount > 0}
    />
  );
}
