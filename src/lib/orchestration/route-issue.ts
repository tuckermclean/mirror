/**
 * Deterministic, zero-API-key issue router.
 *
 * Mirrors the 18 keyword-matching rules in
 * .agents/custom/receptionist-dispatcher.md. Rules are tested in order;
 * first match wins. The function is intentionally pure (no I/O) so it can
 * be unit-tested without any environment setup.
 */

export type ModelId =
  | "claude-haiku-4-5-20251001"
  | "claude-sonnet-4-6"
  | "claude-opus-4-7";

export type RouteDecision = {
  /** Relative path to the agent markdown file, e.g. ".agents/engineering-senior-developer.md" */
  agent: string;
  model: ModelId;
  taskType: string;
};

type Rule = {
  keywords: string[];
  agent: string;
  model: ModelId;
  taskType: string;
};

// Model alias constants
const HAIKU: ModelId = "claude-haiku-4-5-20251001";
const SONNET: ModelId = "claude-sonnet-4-6";
const OPUS: ModelId = "claude-opus-4-7";

/**
 * Routing rules in priority order (first match wins).
 * Each entry lists the keyword tokens/phrases to search for
 * (matched as substrings of the lowercased input).
 */
const RULES: Rule[] = [
  // Rule 1 — Security
  {
    keywords: [
      "auth",
      "login",
      "session",
      "jwt",
      "oauth",
      "crypto",
      "permission",
      "rbac",
      "vulnerability",
      "li_at",
      "cookie",
    ],
    agent: ".agents/engineering-security-engineer.md",
    model: SONNET,
    taskType: "security",
  },
  // Rule 2 — Database
  {
    keywords: [
      "migration",
      ".sql",
      "schema",
      "index",
      "query optimization",
      "database",
      "orm",
      "drizzle",
      "pgvector",
    ],
    agent: ".agents/engineering-database-optimizer.md",
    model: SONNET,
    taskType: "db",
  },
  // Rule 3 — Architecture
  {
    keywords: [
      "architecture",
      "adr",
      "system design",
      "major refactor",
      "trade-off",
      "scalability",
    ],
    agent: ".agents/engineering-software-architect.md",
    model: OPUS,
    taskType: "architecture",
  },
  // Rule 4 — DevOps / CI
  {
    keywords: [
      "ci",
      "cd",
      "pipeline",
      "workflow",
      "docker",
      "kubernetes",
      "terraform",
      "deploy",
      "inngest",
    ],
    agent: ".agents/engineering-devops-automator.md",
    model: SONNET,
    taskType: "implement",
  },
  // Rule 5 — AI / Prompts
  {
    keywords: [
      "prompt",
      "eval",
      "promptfoo",
      "llm",
      "anthropic",
      "embedding",
      "voice card",
      "rag",
      "generation",
      "interview chat",
    ],
    agent: ".agents/engineering-ai-engineer.md",
    model: SONNET,
    taskType: "implement",
  },
  // Rule 6 — UI Design
  {
    keywords: [
      "ui",
      "component",
      "design system",
      "figma",
      "mockup",
      "visual",
      "pixel",
      "tailwind",
      "css",
      "responsive",
      "dark mode",
      "theme",
      "layout",
      "shadcn",
      "framer",
    ],
    agent: ".agents/design-ui-designer.md",
    model: SONNET,
    taskType: "design",
  },
  // Rule 7 — UX Architect
  {
    keywords: [
      "ux",
      "user flow",
      "wireframe",
      "persona",
      "usability",
      "onboarding",
      "user journey",
      "information architecture",
      "navigation",
      "sitemap",
    ],
    agent: ".agents/design-ux-architect.md",
    model: SONNET,
    taskType: "ux",
  },
  // Rule 8 — Accessibility
  {
    keywords: [
      "accessibility",
      "a11y",
      "wcag",
      "aria",
      "screen reader",
      "keyboard nav",
      "color contrast",
    ],
    agent: ".agents/testing-accessibility-auditor.md",
    model: SONNET,
    taskType: "a11y",
  },
  // Rule 9 — Brand
  {
    keywords: [
      "brand",
      "branding",
      "copy",
      "tone",
      "microcopy",
      "color palette",
      "typography",
    ],
    agent: ".agents/design-brand-guardian.md",
    model: HAIKU,
    taskType: "trivial",
  },
  // Rule 10 — Whimsy
  {
    keywords: [
      "whimsy",
      "delight",
      "personality",
      "playful",
      "fun",
      "easter egg",
      "micro-interaction",
      "empty state",
      "404",
      "error page",
      "loading screen",
      "surprise",
      "humor",
      "character",
    ],
    agent: ".agents/design-whimsy-injector.md",
    model: SONNET,
    taskType: "design",
  },
  // Rule 11 — Docs
  {
    keywords: [
      "readme",
      "docs",
      "changelog",
      "documentation",
      "comment",
      "tutorial",
      "api docs",
    ],
    agent: ".agents/engineering-technical-writer.md",
    model: HAIKU,
    taskType: "docs",
  },
  // Rule 12 — Explain / Onboarding
  {
    keywords: [
      "explain",
      "how does",
      "what is",
      "why does",
      "understand",
      "walk me through",
    ],
    agent: ".agents/engineering-codebase-onboarding-engineer.md",
    model: HAIKU,
    taskType: "explain",
  },
  // Rule 13 — Trivial fixes
  {
    keywords: ["typo", "format", "lint", "whitespace", "style only", "rename"],
    agent: ".agents/engineering-senior-developer.md",
    model: HAIKU,
    taskType: "trivial",
  },
  // Rule 14 — Prototype / Spike
  {
    keywords: [
      "prototype",
      "spike",
      "poc",
      "quick",
      "draft",
      "explore",
      "experiment",
    ],
    agent: ".agents/engineering-rapid-prototyper.md",
    model: SONNET,
    taskType: "implement",
  },
  // Rule 15 — Review
  {
    keywords: ["review", "check", "feedback", "look at", "approve"],
    agent: ".agents/engineering-code-reviewer.md",
    model: SONNET,
    taskType: "review",
  },
  // Rule 16 — Sprint planning
  {
    keywords: [
      "prioritize",
      "what should i work on",
      "backlog",
      "sprint planning",
    ],
    agent: ".agents/product-sprint-prioritizer.md",
    model: HAIKU,
    taskType: "plan",
  },
  // Rule 17 — Setup / dependencies
  {
    keywords: [
      "install",
      "dependency",
      "dependencies",
      "scaffold",
      "bootstrap",
      "init",
      "setup",
      "configure project",
      "pnpm add",
      "npm install",
    ],
    agent: ".agents/engineering-senior-developer.md",
    model: SONNET,
    taskType: "setup",
  },
];

// Rule 18 — Default
const DEFAULT_DECISION: RouteDecision = {
  agent: ".agents/engineering-senior-developer.md",
  model: SONNET,
  taskType: "implement",
};

/**
 * Build a keyword matcher for a single keyword token.
 *
 * Short, purely alphabetic tokens (e.g. "ci", "cd", "ux", "ui", "adr") are
 * prone to false-positive substring matches inside longer words
 * ("hallucinated" contains "ci", "drizzle" contains no "adr" but "quadrant"
 * does, etc.).  For those tokens we use a word-boundary regexp so that only
 * whole-word occurrences match.  Multi-word phrases and tokens containing
 * non-alpha characters (`.sql`, `pnpm add`, `api docs`, …) are matched with
 * plain substring search, which is both faster and correct for phrases.
 */
function buildMatcher(keyword: string): (text: string) => boolean {
  const isShortAlpha = /^[a-z]{1,4}$/.test(keyword);
  if (isShortAlpha) {
    const re = new RegExp(`\\b${keyword}\\b`);
    return (text) => re.test(text);
  }
  return (text) => text.includes(keyword);
}

type CompiledRule = {
  matchers: Array<(text: string) => boolean>;
  agent: string;
  model: ModelId;
  taskType: string;
};

const COMPILED_RULES: CompiledRule[] = RULES.map((rule) => ({
  matchers: rule.keywords.map(buildMatcher),
  agent: rule.agent,
  model: rule.model,
  taskType: rule.taskType,
}));

/**
 * Route an issue to the appropriate agent and model.
 *
 * @param text - The concatenated issue title + body. Matching is
 *   case-insensitive; callers do not need to lowercase first.
 * @returns A {@link RouteDecision} with the agent path, model ID, and
 *   task type derived from the first matching rule (or the default).
 */
export function routeIssue(text: string): RouteDecision {
  const lower = text.toLowerCase();

  for (const rule of COMPILED_RULES) {
    for (const matches of rule.matchers) {
      if (matches(lower)) {
        return {
          agent: rule.agent,
          model: rule.model,
          taskType: rule.taskType,
        };
      }
    }
  }

  return { ...DEFAULT_DECISION };
}
