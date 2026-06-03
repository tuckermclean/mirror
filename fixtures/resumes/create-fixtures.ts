/**
 * Script to document the fixture PDF content for tests.
 *
 * Actual PDF bytes are stored as base64 strings in the test helpers.
 * Real PDFs were generated from LinkedIn "Save as PDF" and anonymized.
 *
 * For CI, the unit tests mock the Anthropic API so actual PDF parsing is not required.
 */

export const FIXTURE_METADATA = {
  "resume-01.pdf": {
    name: "Jane Smith",
    headline: "Senior Software Engineer at Acme Corp",
    location: "San Francisco, CA",
    about: "Passionate about building scalable distributed systems.",
    experienceCount: 3,
    educationCount: 1,
    skillsCount: 10,
  },
  "resume-02.pdf": {
    name: "John Doe",
    headline: "Product Manager | B2B SaaS",
    location: "New York, NY",
    about: "Strategic product leader with 8+ years in enterprise software.",
    experienceCount: 4,
    educationCount: 2,
    skillsCount: 12,
  },
  "resume-03.pdf": {
    name: "Alex Chen",
    headline: "Data Scientist",
    location: "Seattle, WA",
    about: "ML researcher turned industry practitioner.",
    experienceCount: 2,
    educationCount: 2,
    skillsCount: 15,
  },
  "resume-04.pdf": {
    name: "Maria Garcia",
    headline: "Marketing Director",
    location: "Chicago, IL",
    about: undefined,
    experienceCount: 5,
    educationCount: 1,
    skillsCount: 8,
  },
  "resume-05-malformed.pdf": {
    name: "",
    headline: "",
    about: undefined,
    experienceCount: 0,
    educationCount: 0,
    skillsCount: 0,
  },
};
