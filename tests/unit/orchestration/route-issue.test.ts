import { describe, it, expect } from "vitest";
import { routeIssue } from "@/lib/orchestration/route-issue";

// ── Rule 1: Security ─────────────────────────────────────────────────────────
describe("rule 1 — security", () => {
  it("routes 'auth' to security-engineer on sonnet", () => {
    const d = routeIssue("Fix the auth flow so sessions expire correctly");
    expect(d.agent).toBe(".agents/engineering-security-engineer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("security");
  });

  it("routes 'li_at cookie' to security-engineer", () => {
    const d = routeIssue("Encrypt the li_at cookie before storage");
    expect(d.agent).toBe(".agents/engineering-security-engineer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("security");
  });

  it("routes 'oauth' to security-engineer", () => {
    const d = routeIssue("Add oauth2 support for Google login");
    expect(d.agent).toBe(".agents/engineering-security-engineer.md");
  });

  it("routes 'vulnerability' to security-engineer", () => {
    const d = routeIssue("Patch the XSS vulnerability in the profile renderer");
    expect(d.agent).toBe(".agents/engineering-security-engineer.md");
  });
});

// ── Rule 2: Database ─────────────────────────────────────────────────────────
describe("rule 2 — database", () => {
  it("routes 'migration' to database-optimizer on sonnet", () => {
    const d = routeIssue("Add a migration to add an index on the users table");
    expect(d.agent).toBe(".agents/engineering-database-optimizer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("db");
  });

  it("routes '.sql' file mention to database-optimizer", () => {
    const d = routeIssue("Update the 0003_add_embeddings.sql file to add the column");
    expect(d.agent).toBe(".agents/engineering-database-optimizer.md");
  });

  it("routes 'pgvector' to database-optimizer", () => {
    const d = routeIssue("Add pgvector support for similarity search");
    expect(d.agent).toBe(".agents/engineering-database-optimizer.md");
  });

  it("routes 'drizzle' to database-optimizer", () => {
    const d = routeIssue("Update the drizzle schema to add soft deletes");
    expect(d.agent).toBe(".agents/engineering-database-optimizer.md");
  });

  it("routes 'query optimization' to database-optimizer", () => {
    const d = routeIssue("query optimization needed for the user lookup");
    expect(d.agent).toBe(".agents/engineering-database-optimizer.md");
  });
});

// ── Rule 3: Architecture ─────────────────────────────────────────────────────
describe("rule 3 — architecture", () => {
  it("routes 'software architecture' to software-architect on opus", () => {
    const d = routeIssue("Discuss the software architecture for multi-tenant data isolation");
    expect(d.agent).toBe(".agents/engineering-software-architect.md");
    expect(d.model).toBe("claude-opus-4-8");
    expect(d.taskType).toBe("architecture");
  });

  it("routes 'system architecture' to software-architect on opus", () => {
    const d = routeIssue("Document the system architecture decisions made this quarter");
    expect(d.agent).toBe(".agents/engineering-software-architect.md");
    expect(d.model).toBe("claude-opus-4-8");
  });

  it("routes 'adr' to software-architect on opus", () => {
    const d = routeIssue("Write an ADR for the new job queue approach");
    expect(d.agent).toBe(".agents/engineering-software-architect.md");
    expect(d.model).toBe("claude-opus-4-8");
  });

  it("routes 'scalability' to software-architect on opus", () => {
    const d = routeIssue("Review the job queue design for scalability");
    expect(d.agent).toBe(".agents/engineering-software-architect.md");
  });

  it("routes 'trade-off' to software-architect on opus", () => {
    const d = routeIssue("Analyze the trade-off between Redis and Postgres for caching");
    expect(d.agent).toBe(".agents/engineering-software-architect.md");
  });

  it("'information architecture' routes to ux-architect, NOT software-architect", () => {
    // Regression: bare 'architecture' was triggering rule 3 before the phrase-form fix.
    const d = routeIssue("Redesign the information architecture for the onboarding flow");
    expect(d.agent).toBe(".agents/design-ux-architect.md");
    expect(d.model).toBe("claude-sonnet-4-6");
  });
});

// ── Rule 4: DevOps / CI ──────────────────────────────────────────────────────
describe("rule 4 — devops", () => {
  it("routes 'ci' to devops-automator on sonnet", () => {
    const d = routeIssue("Fix the CI pipeline so tests run in parallel");
    expect(d.agent).toBe(".agents/engineering-devops-automator.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("implement");
  });

  it("routes 'docker' to devops-automator", () => {
    const d = routeIssue("Update the Dockerfile to use a multi-stage build");
    expect(d.agent).toBe(".agents/engineering-devops-automator.md");
  });

  it("routes 'kubernetes' to devops-automator", () => {
    const d = routeIssue("Add kubernetes HPA config for the worker deployment");
    expect(d.agent).toBe(".agents/engineering-devops-automator.md");
  });

  it("routes 'inngest' to devops-automator", () => {
    const d = routeIssue("Configure inngest concurrency limits for the embed pipeline");
    expect(d.agent).toBe(".agents/engineering-devops-automator.md");
  });
});

// ── Rule 5: AI / Prompts ─────────────────────────────────────────────────────
describe("rule 5 — AI engineer", () => {
  it("routes 'prompt' to ai-engineer on sonnet", () => {
    const d = routeIssue("Tune the rewrite prompt to reduce hallucinated job titles");
    expect(d.agent).toBe(".agents/engineering-ai-engineer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("implement");
  });

  it("routes 'eval' to ai-engineer", () => {
    const d = routeIssue("Add a promptfoo eval for voice fidelity scoring");
    expect(d.agent).toBe(".agents/engineering-ai-engineer.md");
  });

  it("routes 'embedding' to ai-engineer", () => {
    const d = routeIssue("Switch the embedding provider from OpenAI to Voyage AI");
    expect(d.agent).toBe(".agents/engineering-ai-engineer.md");
  });

  it("routes 'rag' to ai-engineer", () => {
    const d = routeIssue("Implement RAG retrieval for contextual profile rewriting");
    expect(d.agent).toBe(".agents/engineering-ai-engineer.md");
  });

  it("routes 'interview chat' to ai-engineer", () => {
    const d = routeIssue("Improve the interview chat streaming experience");
    expect(d.agent).toBe(".agents/engineering-ai-engineer.md");
  });
});

// ── Rule 6: UI Design ────────────────────────────────────────────────────────
describe("rule 6 — UI designer", () => {
  it("routes 'tailwind' to ui-designer on sonnet", () => {
    const d = routeIssue("Refactor the card layout using Tailwind grid utilities");
    expect(d.agent).toBe(".agents/design-ui-designer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("design");
  });

  it("routes 'shadcn' to ui-designer", () => {
    const d = routeIssue("Add a shadcn Dialog for the export modal");
    expect(d.agent).toBe(".agents/design-ui-designer.md");
  });

  it("routes 'dark mode' to ui-designer", () => {
    const d = routeIssue("Implement dark mode toggle in the settings panel");
    expect(d.agent).toBe(".agents/design-ui-designer.md");
  });

  it("routes 'framer' to ui-designer", () => {
    const d = routeIssue("Add framer motion entrance animation to the hero section");
    expect(d.agent).toBe(".agents/design-ui-designer.md");
  });
});

// ── Rule 7: UX Architect ─────────────────────────────────────────────────────
describe("rule 7 — UX architect", () => {
  it("routes 'user flow' to ux-architect on sonnet", () => {
    const d = routeIssue("Map out the user flow for the profile review walkthrough");
    expect(d.agent).toBe(".agents/design-ux-architect.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("ux");
  });

  it("routes 'wireframe' to ux-architect", () => {
    const d = routeIssue("Create wireframe for the interview completion screen");
    expect(d.agent).toBe(".agents/design-ux-architect.md");
  });

  it("routes 'onboarding' to ux-architect", () => {
    const d = routeIssue("Redesign the onboarding sequence for new users");
    expect(d.agent).toBe(".agents/design-ux-architect.md");
  });

  it("routes 'sitemap' to ux-architect", () => {
    // note: 'information architecture' contains the word 'architecture'
    // which triggers rule 3 (software-architect) before rule 7. Use a
    // different rule-7 keyword that has no rule 1-6 overlap.
    const d = routeIssue("Draft a sitemap for the new settings section");
    expect(d.agent).toBe(".agents/design-ux-architect.md");
  });
});

// ── Rule 8: Accessibility ────────────────────────────────────────────────────
describe("rule 8 — accessibility auditor", () => {
  it("routes 'a11y' to accessibility-auditor on sonnet", () => {
    const d = routeIssue("Fix a11y issues in the profile diff view");
    expect(d.agent).toBe(".agents/testing-accessibility-auditor.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("a11y");
  });

  it("routes 'wcag' to accessibility-auditor", () => {
    const d = routeIssue("Ensure WCAG AA compliance for the heatmap overlay");
    expect(d.agent).toBe(".agents/testing-accessibility-auditor.md");
  });

  it("routes 'aria' to accessibility-auditor", () => {
    // avoid 'component' (rule 6 UI) — use a clean sentence
    const d = routeIssue("Add aria-live regions to the streaming chat widget");
    expect(d.agent).toBe(".agents/testing-accessibility-auditor.md");
  });

  it("routes 'keyboard nav' to accessibility-auditor", () => {
    const d = routeIssue("Implement keyboard nav for the accept/reject controls");
    expect(d.agent).toBe(".agents/testing-accessibility-auditor.md");
  });
});

// ── Rule 9: Brand ────────────────────────────────────────────────────────────
describe("rule 9 — brand guardian", () => {
  it("routes 'branding' to brand-guardian on haiku", () => {
    const d = routeIssue("Update branding guidelines for the new product identity");
    expect(d.agent).toBe(".agents/design-brand-guardian.md");
    expect(d.model).toBe("claude-haiku-4-5-20251001");
    expect(d.taskType).toBe("trivial");
  });

  it("routes 'microcopy' to brand-guardian", () => {
    const d = routeIssue("Rewrite the microcopy on the empty state screens");
    expect(d.agent).toBe(".agents/design-brand-guardian.md");
  });

  it("routes 'color palette' to brand-guardian", () => {
    // avoid 'theme' (rule 6 UI) — use a clean sentence
    const d = routeIssue("Define the color palette for the new product identity");
    expect(d.agent).toBe(".agents/design-brand-guardian.md");
  });

  it("routes 'typography' to brand-guardian", () => {
    const d = routeIssue("Choose a typography scale for the landing page");
    expect(d.agent).toBe(".agents/design-brand-guardian.md");
  });
});

// ── Rule 10: Whimsy ──────────────────────────────────────────────────────────
describe("rule 10 — whimsy injector", () => {
  it("routes 'whimsy' to whimsy-injector on sonnet", () => {
    const d = routeIssue("Add whimsy to the loading screen between interview steps");
    expect(d.agent).toBe(".agents/design-whimsy-injector.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("design");
  });

  it("routes 'easter egg' to whimsy-injector", () => {
    const d = routeIssue("Add an easter egg on the 404 error page");
    expect(d.agent).toBe(".agents/design-whimsy-injector.md");
  });

  it("routes 'micro-interaction' to whimsy-injector", () => {
    const d = routeIssue("Design a micro-interaction for the accept button");
    expect(d.agent).toBe(".agents/design-whimsy-injector.md");
  });

  it("routes 'delight' to whimsy-injector", () => {
    // avoid 'generation' (rule 5 AI) — use a clean sentence
    const d = routeIssue("Add delight moments to the profile success screen");
    expect(d.agent).toBe(".agents/design-whimsy-injector.md");
  });
});

// ── Rule 11: Docs ────────────────────────────────────────────────────────────
describe("rule 11 — technical writer", () => {
  it("routes 'readme' to technical-writer on haiku", () => {
    const d = routeIssue("Update the README with the new setup instructions");
    expect(d.agent).toBe(".agents/engineering-technical-writer.md");
    expect(d.model).toBe("claude-haiku-4-5-20251001");
    expect(d.taskType).toBe("docs");
  });

  it("routes 'changelog' to technical-writer", () => {
    const d = routeIssue("Add changelog entry for the v1.2 release");
    expect(d.agent).toBe(".agents/engineering-technical-writer.md");
  });

  it("routes 'api docs' to technical-writer", () => {
    // avoid 'generation' (rule 5 AI) — use a clean sentence
    const d = routeIssue("Write api docs for the profile rewrite endpoint");
    expect(d.agent).toBe(".agents/engineering-technical-writer.md");
  });

  it("routes 'documentation' to technical-writer", () => {
    // avoid 'pipeline' (rule 4 devops) and 'voice card' (rule 5 AI)
    const d = routeIssue("Add documentation for the billing webhook handler");
    expect(d.agent).toBe(".agents/engineering-technical-writer.md");
  });
});

// ── Rule 12: Explain / Onboarding ───────────────────────────────────────────
describe("rule 12 — codebase onboarding engineer", () => {
  it("routes 'explain' to onboarding-engineer on haiku", () => {
    // avoid 'pipeline' (rule 4 devops) and 'embedding' (rule 5 AI)
    const d = routeIssue("Explain how the monthly spend cap enforcement works");
    expect(d.agent).toBe(".agents/engineering-codebase-onboarding-engineer.md");
    expect(d.model).toBe("claude-haiku-4-5-20251001");
    expect(d.taskType).toBe("explain");
  });

  it("routes 'how does' to onboarding-engineer", () => {
    // 'llm' (rule 5 AI) would fire first — use a clean sentence
    const d = routeIssue("How does the monthly spend cap enforcement work?");
    expect(d.agent).toBe(".agents/engineering-codebase-onboarding-engineer.md");
  });

  it("routes 'walk me through' to onboarding-engineer", () => {
    // avoid 'inngest' (rule 4 devops) and 'setup' (rule 17)
    const d = routeIssue("Walk me through the PII read pattern");
    expect(d.agent).toBe(".agents/engineering-codebase-onboarding-engineer.md");
  });

  it("routes 'understand' to onboarding-engineer", () => {
    const d = routeIssue("Help me understand the PII read pattern used in this repo");
    expect(d.agent).toBe(".agents/engineering-codebase-onboarding-engineer.md");
  });
});

// ── Rule 13: Trivial fixes ───────────────────────────────────────────────────
describe("rule 13 — senior developer (trivial)", () => {
  it("routes 'typo' to senior-developer on haiku", () => {
    // avoid 'login' (rule 1 security) — use a clean sentence
    const d = routeIssue("Fix a typo in the error message on the sign-in page");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.model).toBe("claude-haiku-4-5-20251001");
    expect(d.taskType).toBe("trivial");
  });

  it("routes 'lint' to senior-developer on haiku", () => {
    // avoid 'voice card' (rule 5 AI) — use a clean sentence
    const d = routeIssue("Fix lint errors in the billing module");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.model).toBe("claude-haiku-4-5-20251001");
  });

  it("routes 'whitespace' to senior-developer on haiku", () => {
    // avoid 'schema' (rule 2 database) — use a clean sentence
    const d = routeIssue("Remove trailing whitespace from the constants file");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.model).toBe("claude-haiku-4-5-20251001");
  });
});

// ── Rule 14: Prototype / Spike ───────────────────────────────────────────────
describe("rule 14 — rapid prototyper", () => {
  it("routes 'prototype' to rapid-prototyper on sonnet", () => {
    const d = routeIssue("Prototype a side-by-side diff view for profile sections");
    expect(d.agent).toBe(".agents/engineering-rapid-prototyper.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("implement");
  });

  it("routes 'poc' to rapid-prototyper", () => {
    // avoid 'generation' (rule 5 AI) — use a clean sentence
    const d = routeIssue("Build a POC for streaming profile rewrites with SSE");
    expect(d.agent).toBe(".agents/engineering-rapid-prototyper.md");
  });

  it("routes 'spike' to rapid-prototyper", () => {
    const d = routeIssue("Spike a local Ollama integration for offline dev testing");
    expect(d.agent).toBe(".agents/engineering-rapid-prototyper.md");
  });

  it("routes 'experiment' to rapid-prototyper", () => {
    // avoid 'rag' (rule 5 AI) — use a clean sentence
    const d = routeIssue("Experiment with different chunking strategies for retrieval");
    expect(d.agent).toBe(".agents/engineering-rapid-prototyper.md");
  });
});

// ── Rule 15: Review ──────────────────────────────────────────────────────────
describe("rule 15 — code reviewer", () => {
  it("routes 'review' to code-reviewer on sonnet", () => {
    const d = routeIssue("Review the new rate-limiting middleware before merging");
    expect(d.agent).toBe(".agents/engineering-code-reviewer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("review");
  });

  it("routes 'feedback' to code-reviewer", () => {
    // avoid 'session' (rule 1 security) — use a clean sentence
    const d = routeIssue("Give feedback on the new rate limiter management PR");
    expect(d.agent).toBe(".agents/engineering-code-reviewer.md");
  });

  it("routes 'approve' to code-reviewer", () => {
    const d = routeIssue("Approve the changes to the billing webhook handler");
    expect(d.agent).toBe(".agents/engineering-code-reviewer.md");
  });
});

// ── Rule 16: Sprint planning ─────────────────────────────────────────────────
describe("rule 16 — sprint prioritizer", () => {
  it("routes 'prioritize' to sprint-prioritizer on haiku", () => {
    const d = routeIssue("Prioritize the open bugs for next sprint");
    expect(d.agent).toBe(".agents/product-sprint-prioritizer.md");
    expect(d.model).toBe("claude-haiku-4-5-20251001");
    expect(d.taskType).toBe("plan");
  });

  it("routes 'backlog' to sprint-prioritizer", () => {
    const d = routeIssue("Groom the backlog for Q3 planning");
    expect(d.agent).toBe(".agents/product-sprint-prioritizer.md");
  });

  it("routes 'sprint planning' to sprint-prioritizer", () => {
    const d = routeIssue("Help with sprint planning for the v1 launch milestone");
    expect(d.agent).toBe(".agents/product-sprint-prioritizer.md");
  });

  it("routes 'what should i work on' to sprint-prioritizer", () => {
    const d = routeIssue("What should i work on next given the current milestones?");
    expect(d.agent).toBe(".agents/product-sprint-prioritizer.md");
  });
});

// ── Rule 17: Setup ───────────────────────────────────────────────────────────
describe("rule 17 — senior developer (setup)", () => {
  it("routes 'pnpm add' to senior-developer (setup) on sonnet", () => {
    const d = routeIssue("pnpm add the zod library to validate API responses");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("setup");
  });

  it("routes 'scaffold' to senior-developer (setup)", () => {
    const d = routeIssue("Scaffold a new Next.js route for the export feature");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.taskType).toBe("setup");
  });

  it("routes 'bootstrap' to senior-developer (setup)", () => {
    const d = routeIssue("Bootstrap the new analytics module with PostHog");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.taskType).toBe("setup");
  });

  it("routes 'configure project' to senior-developer (setup)", () => {
    const d = routeIssue("Configure project ESLint rules for the new lib");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.taskType).toBe("setup");
  });
});

// ── Rule 18: Default ─────────────────────────────────────────────────────────
describe("rule 18 — default (senior developer)", () => {
  it("routes generic implementation task to senior-developer on sonnet", () => {
    const d = routeIssue("Add pagination to the profile history list");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("implement");
  });

  it("routes empty string to senior-developer (default)", () => {
    const d = routeIssue("");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
    expect(d.model).toBe("claude-sonnet-4-6");
    expect(d.taskType).toBe("implement");
  });
});

// ── Cross-cutting behavioural rules ──────────────────────────────────────────
describe("first-match-wins", () => {
  it("text matching rules 2 and 4 routes to rule 2 (database beats devops)", () => {
    // 'migration' (rule 2) and 'pipeline' (rule 4) both present
    const d = routeIssue("Create a database migration for the ci pipeline config table");
    expect(d.agent).toBe(".agents/engineering-database-optimizer.md");
  });

  it("text matching rules 1 and 5 routes to rule 1 (security beats AI)", () => {
    // 'crypto' (rule 1) and 'embedding' (rule 5) both present
    const d = routeIssue("Encrypt the embedding vector with crypto before storage");
    expect(d.agent).toBe(".agents/engineering-security-engineer.md");
  });

  it("text matching rules 11 and 13 routes to rule 11 (docs beats trivial)", () => {
    // 'readme' (rule 11) and 'typo' (rule 13) both present
    const d = routeIssue("Fix a typo in the README");
    expect(d.agent).toBe(".agents/engineering-technical-writer.md");
  });
});

describe("word-boundary guard — short tokens must not fire inside longer words", () => {
  it("'hallucinated' does not trigger the 'ci' devops rule", () => {
    const d = routeIssue("Fix hallucinated job titles in the profile output");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
  });

  it("'acidic' does not trigger the 'ci' devops rule", () => {
    const d = routeIssue("Handle acidic edge cases in the parser");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
  });

  it("'fluid' does not trigger the 'ui' design rule", () => {
    const d = routeIssue("Make the animation more fluid");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
  });

  it("'quadrant' does not trigger the 'adr' architecture rule", () => {
    const d = routeIssue("Plot the results in a quadrant chart");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
  });

  it("'luxury' does not trigger the 'ux' design rule", () => {
    const d = routeIssue("This feature has a luxury feel to it");
    expect(d.agent).toBe(".agents/engineering-senior-developer.md");
  });
});

describe("case-insensitivity", () => {
  it("uppercased keyword 'DATABASE' routes like 'database'", () => {
    const d = routeIssue("Optimize the DATABASE query for slow lookups");
    expect(d.agent).toBe(".agents/engineering-database-optimizer.md");
  });

  it("mixed-case 'Auth' routes like 'auth'", () => {
    const d = routeIssue("Refactor Auth token refresh logic");
    expect(d.agent).toBe(".agents/engineering-security-engineer.md");
  });

  it("mixed-case 'Prompt' routes like 'prompt'", () => {
    const d = routeIssue("Improve the Prompt for generating the summary section");
    expect(d.agent).toBe(".agents/engineering-ai-engineer.md");
  });
});
