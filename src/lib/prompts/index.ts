import { readFileSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname);

function loadPrompt(filename: string): { content: string; hash: string } {
  const content = readFileSync(join(PROMPTS_DIR, filename), "utf-8");
  const hash = createHash("sha256").update(content).digest("hex");
  return { content, hash };
}

export const prompts = {
  interviewSystem: loadPrompt("interview_system.md"),
  profileGeneration: loadPrompt("generation_system.md"),
  // Wk 3+: voiceExtraction, rationale, recruiterEye
} as const;
