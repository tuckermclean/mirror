import type {
  GeneratedProfile,
  RationaleBundle,
  WalkthroughData,
} from "./types";

/**
 * Built-in demo fixture for the walkthrough.
 *
 * Rendered when the route id is `seed-generation-1` (the id E2E/visual/a11y
 * tests hit) or when a real generation row is absent in dev/test — the DB seed
 * is a no-op until Week 6. Real generation ids always read from the DB behind
 * the owner-only auth guard; this fixture is never returned for them.
 */
export const SEED_GENERATION_ID = "seed-generation-1";

const FIXTURE_BEFORE: GeneratedProfile = {
  headline: "Software Engineer at Acme",
  about:
    "Experienced software engineer with a passion for building things. " +
    "I have worked on a variety of projects and enjoy solving problems. " +
    "Looking for new opportunities to grow my career.",
  experience: [
    {
      company: "Acme Corp",
      title: "Software Engineer",
      bullets: [
        "Worked on the payments team.",
        "Helped improve the checkout flow.",
        "Collaborated with other engineers.",
      ],
    },
    {
      company: "Startup Inc",
      title: "Junior Developer",
      bullets: [
        "Built features for the web app.",
        "Fixed bugs and wrote tests.",
      ],
    },
  ],
  education: [
    { school: "State University", degree: "B.S. Computer Science" },
  ],
  skills: ["JavaScript", "React", "Node.js", "SQL", "Communication"],
};

const FIXTURE_AFTER: GeneratedProfile = {
  headline: "Senior Payments Engineer · Cut checkout drop-off 18% at Acme",
  about:
    "I build payment systems people actually trust. At Acme I rebuilt the " +
    "checkout flow that handles $40M in annual volume, cutting drop-off 18% " +
    "and shaving 600ms off median latency. I care about the unglamorous work — " +
    "idempotency, retries, reconciliation — because that's where trust lives. " +
    "Next, I want to own payments infrastructure end to end at a team that " +
    "ships fast and measures everything.",
  experience: [
    {
      company: "Acme Corp",
      title: "Senior Software Engineer, Payments",
      bullets: [
        "Rebuilt the checkout flow handling $40M/yr, cutting drop-off 18%.",
        "Drove median checkout latency down 600ms by reworking the retry path.",
        "Mentored 3 engineers and ran the payments on-call rotation.",
      ],
    },
    {
      company: "Startup Inc",
      title: "Software Developer",
      bullets: [
        "Shipped 12 customer-facing features for a web app serving 50k users.",
        "Raised test coverage from 41% to 78%, halving production incidents.",
      ],
    },
  ],
  education: [
    { school: "State University", degree: "B.S. Computer Science" },
  ],
  skills: [
    "Payments Infrastructure",
    "Distributed Systems",
    "TypeScript",
    "React",
    "PostgreSQL",
    "Observability",
  ],
};

const FIXTURE_RATIONALE: RationaleBundle = {
  headline:
    "Leads with a quantified outcome (18% drop-off) and a specific role, so a " +
    "recruiter sees impact in the first three seconds instead of a generic title.",
  about:
    "Opens with a point of view, anchors it in a concrete number ($40M, 18%, " +
    "600ms), and ends with a clear forward ask — the hook-evidence-direction " +
    "pattern that top profiles in your field use.",
  experience: [
    "Rewrote each bullet to start with a strong verb and a measurable result, " +
      "replacing duties with outcomes.",
    "Reframed 'Junior Developer' duties as quantified shipping and quality wins " +
      "to signal trajectory.",
  ],
  skills:
    "Reordered to put differentiated, role-specific skills first and dropped " +
    "soft-skill filler that every profile claims.",
  recruiterEye: [
    {
      rank: 1,
      observation: "The 18% drop-off number in the headline grabs the eye first.",
      section: "headline",
    },
    {
      rank: 2,
      observation: "The $40M figure in the About anchors credibility instantly.",
      section: "about",
    },
    {
      rank: 3,
      observation: "Quantified bullets read as outcomes, not responsibilities.",
      section: "experience",
    },
    {
      rank: 4,
      observation: "Specialized skills up top signal depth over breadth.",
      section: "skills",
    },
  ],
  confidence: { headline: 92, about: 88, experience: 90, skills: 84 },
};

/** The demo walkthrough payload used for the seed id and dev/test fallbacks. */
export const WALKTHROUGH_FIXTURE: WalkthroughData = {
  generationId: SEED_GENERATION_ID,
  before: FIXTURE_BEFORE,
  after: FIXTURE_AFTER,
  rationale: FIXTURE_RATIONALE,
  isFixture: true,
};
