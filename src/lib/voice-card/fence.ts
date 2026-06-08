/**
 * Canonical markdown code-fence stripping regex.
 *
 * Matches an optionally-`json`-tagged triple-backtick fenced block and captures
 * the inner body. Used to strip code fences from LLM output before JSON.parse.
 *
 * This is the single documented source of truth. The CommonJS mirror in
 * `evals/helpers/assert-voice-card-schema.cjs` and the inline JS in
 * `evals/voice-extraction.yaml` cannot ESM-import this module, so they each
 * carry a copy annotated `// canonical: src/lib/voice-card/fence.ts`.
 */
export const FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i;
