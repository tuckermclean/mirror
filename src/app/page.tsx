import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Mirror</h1>
      <p className="text-lg text-gray-600 mb-8 text-center max-w-md">
        Rewrite your LinkedIn profile in your authentic voice with measurably better positioning.
      </p>
      <div className="flex gap-4">
        <Link
          href="/sign-up"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Get Started
        </Link>
        <Link
          href="/sign-in"
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
