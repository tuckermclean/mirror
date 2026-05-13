import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { InterviewChat } from "@/components/interview-chat";

export default async function InterviewPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <main className="min-h-screen flex flex-col items-center py-12 px-4">
      <h1 className="text-2xl font-semibold mb-8">Your Story</h1>
      <InterviewChat userId={userId} />
    </main>
  );
}
