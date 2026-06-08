import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LinkedInForm } from "./_form";

export default async function LinkedInOnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect your LinkedIn
          </h1>
          <p className="text-sm text-muted-foreground">
            Mirror reads your profile to rewrite it in your authentic voice.
            Your session cookie is encrypted end-to-end and never returned to
            the browser.
          </p>
        </header>

        <LinkedInForm />
      </div>
    </main>
  );
}
