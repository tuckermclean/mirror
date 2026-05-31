import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { gte, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { llmSpendLedger } from "@/db/schema";

export const dynamic = "force-dynamic";

type ModelRow = {
  model: string;
  total: string | null;
};

async function getMtdData(): Promise<{ totalUsd: number; byModel: ModelRow[]; startOfMonth: Date }> {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [totalRow] = await db
    .select({ total: sum(llmSpendLedger.costUsd) })
    .from(llmSpendLedger)
    .where(gte(llmSpendLedger.recordedAt, startOfMonth));

  const byModel: ModelRow[] = await db
    .select({ model: llmSpendLedger.model, total: sum(llmSpendLedger.costUsd) })
    .from(llmSpendLedger)
    .where(gte(llmSpendLedger.recordedAt, startOfMonth))
    .groupBy(llmSpendLedger.model);

  return {
    totalUsd: Number(totalRow?.total ?? 0),
    byModel,
    startOfMonth,
  };
}

export default async function AdminCostsPage() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  const user = await currentUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((user?.publicMetadata as any)?.role !== "admin") {
    redirect("/");
  }

  const rawCap = Number(process.env["LLM_MONTHLY_CAP_USD"] ?? 20);
  const cap = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : 20;
  const { totalUsd, byModel, startOfMonth } = await getMtdData();

  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilReset = Math.ceil((nextMonth.getTime() - now.getTime()) / msPerDay);

  const pctUsed = Math.min((totalUsd / cap) * 100, 100);
  const monthLabel = startOfMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">LLM Cost Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">{monthLabel}</p>
      </div>

      {/* MTD spend vs cap */}
      <section className="rounded-lg border p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-muted-foreground">Month-to-date spend</span>
          <span className="text-2xl font-bold">${totalUsd.toFixed(4)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-muted-foreground">Monthly cap</span>
          <span className="text-lg font-semibold">${cap.toFixed(2)}</span>
        </div>
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuenow={Math.round(pctUsed)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Monthly LLM spend"
            className="h-2 rounded-full bg-secondary overflow-hidden"
          >
            <div
              className={`h-full rounded-full ${pctUsed >= 80 ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${pctUsed}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">{pctUsed.toFixed(1)}% used</p>
        </div>
        {pctUsed >= 80 && (
          <p className="text-sm text-destructive font-medium">
            Warning: {pctUsed.toFixed(1)}% of cap consumed. Generation will be blocked at 100%.
          </p>
        )}
        <div className="flex items-baseline justify-between border-t pt-3">
          <span className="text-sm font-medium text-muted-foreground">Resets in</span>
          <span className="text-sm font-semibold">
            {daysUntilReset} day{daysUntilReset !== 1 ? "s" : ""} ({nextMonth.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })})
          </span>
        </div>
      </section>

      {/* Per-model breakdown */}
      <section className="rounded-lg border p-6 space-y-3">
        <h2 className="text-sm font-semibold">Per-model breakdown</h2>
        {byModel.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spend recorded this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium text-right">Cost (USD)</th>
                <th className="pb-2 font-medium text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byModel.map((row) => {
                const rowUsd = Number(row.total ?? 0);
                const share = totalUsd > 0 ? (rowUsd / totalUsd) * 100 : 0;
                return (
                  <tr key={row.model}>
                    <td className="py-2 font-mono text-xs">{row.model}</td>
                    <td className="py-2 text-right">${rowUsd.toFixed(4)}</td>
                    <td className="py-2 text-right text-muted-foreground">{share.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
