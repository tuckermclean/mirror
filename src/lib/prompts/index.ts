import { readFileSync } from "fs";
import { createHash } from "crypto";

const PROMPTS_DIR = new URL("./", import.meta.url);

function loadPrompt(filename: string): { content: string; hash: string } {
  const content = readFileSync(new URL(filename, PROMPTS_DIR), "utf-8");
  const hash = createHash("sha256").update(content).digest("hex");
  return { content, hash };
}

export const prompts = {
  interviewSystem: loadPrompt("interview_system.md"),
  // Wk 3+: voiceExtraction, profileGeneration, rationale, recruiterEye
} as const;
