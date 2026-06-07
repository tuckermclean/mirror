import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, and, isNotNull, ne, count } from "drizzle-orm";
import { db } from "@/db/client";
import { users, interviews, imports, generations } from "@/db/schema";
import { DELETED_PLAN } from "@/lib/db/delete-user";
import { OnboardingSteps } from "@/components/dashboard/onboarding-steps";
import { logger } from "@/lib/logger";

export default async function DashboardPage() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  // Upsert user row on first visit. INSERT ... ON CONFLICT DO NOTHING avoids a
  // TOCTOU race when two tabs open simultaneously — both inserts are safe because
  // the second hits the unique constraint and is silently discarded rather than
  // erroring.
  const clerkUser = await currentUser();
  const rawEmail = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!rawEmail) {
    logger.warn("clerk user has no email address — using fallback", { clerkUserId });
  }
  const email = rawEmail ?? `${clerkUserId}@clerk.test`;

  const [inserted] = await db
    .insert(users)
    .values({ clerkId: clerkUserId, email })
    .onConflictDoNothing()
    .returning({ id: users.id });

  // If the row pre-existed the conflict branch returns no rows; fetch it once.
  // Exclude tombstone rows (ADR-009) so deleted users can't resume a dashboard session.
  const userId = inserted?.id ?? (
    await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.clerkId, clerkUserId), ne(users.plan, DELETED_PLAN)))
      .limit(1)
      .then((rows) => rows[0]?.id)
  );

  if (!userId) redirect("/sign-in");

  const [completedInterview, importRow, generationRow] = await Promise.all([
    db
      .select({ completedAt: interviews.completedAt })
      .from(interviews)
      .where(and(eq(interviews.userId, userId), isNotNull(interviews.completedAt)))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: count() })
      .from(imports)
      .where(eq(imports.userId, userId))
      .then((rows) => rows[0]),
    db
      .select({ id: generations.id })
      .from(generations)
      .where(eq(generations.userId, userId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const importCount = importRow?.value ?? 0;

  return (
    <OnboardingSteps
      step1Complete={!!completedInterview}
      step2Complete={importCount > 0}
      step3Complete={!!generationRow}
    />
  );
}
