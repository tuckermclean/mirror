import { createHash } from "node:crypto";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { generations } from "@/db/schema";

/**
 * Inputs to a generation call that uniquely determine its output.
 * Hashing these lets us cache identical generations (AGENTS.md prompt caching rule).
 */
export type PromptHashInput = {
  systemPrompt: string;
  userMessages: unknown;
  modelId: string;
};

/**
 * Deterministic SHA-256 over the generation inputs.
 *
 * The object-literal field order (systemPrompt, userMessages, modelId) is
 * load-bearing: JSON.stringify serialises keys in insertion order, so the hash
 * is only stable if every caller constructs the object identically. Do not
 * reorder these fields.
 */
export function computePromptHash(input: PromptHashInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        systemPrompt: input.systemPrompt,
        userMessages: input.userMessages,
        modelId: input.modelId,
      })
    )
    .digest("hex");
}

/**
 * Return the newest generation row matching `promptHash` created within the last
 * `withinHours` whose output is non-null, or null if none found.
 *
 * The `isNotNull(generations.output)` guard prevents cache poisoning: the
 * generate route inserts a placeholder row with `output: null` before Inngest
 * runs.  If Inngest fails permanently (spend cap exhausted, missing data, etc.)
 * that null-output placeholder would otherwise match for 24 h, returning
 * `{ cached: true }` to every retry while the output stays null forever.
 */
export async function findCachedGeneration(
  promptHash: string,
  withinHours = 24
): Promise<{ id: string; output: unknown } | null> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);

  const rows = await db
    .select({ id: generations.id, output: generations.output })
    .from(generations)
    .where(
      and(
        eq(generations.promptHash, promptHash),
        gte(generations.createdAt, cutoff),
        isNotNull(generations.output)
      )
    )
    .orderBy(desc(generations.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { id: row.id, output: row.output };
}
