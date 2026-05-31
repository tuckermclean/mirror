# Mirror — Compliance Analysis & Legal Roadmap

**Prepared by:** Legal Compliance Checker  
**Date:** 2026-05-12  
**Scope:** Pre-launch risk analysis covering LinkedIn ToS, GDPR/CCPA, EU AI Act, payment law, and required policy documents  
**Jurisdictions:** United States (federal + California), European Union  
**Status:** DRAFT — sections marked [LAWYER REVIEW REQUIRED] must be reviewed by qualified counsel before launch

---

> **Disclaimer:** This document is a compliance risk analysis and roadmap, not legal advice. It identifies obligations and risks but does not constitute an attorney-client relationship. Mirror must retain qualified legal counsel in the US and EU before accepting paying users.

---

## Table of Contents

1. [LinkedIn Terms of Service Posture](#1-linkedin-terms-of-service-posture)
2. [GDPR / CCPA Compliance — AI History Imports](#2-gdpr--ccpa-compliance--ai-history-imports)
3. [Recruiter-Side B2B Data Disclosures (§6.7)](#3-recruiter-side-b2b-data-disclosures-67)
4. [EU AI Act Transparency Obligations](#4-eu-ai-act-transparency-obligations)
5. [Payment and Subscription Compliance](#5-payment-and-subscription-compliance)
6. [Required Policy Documents Checklist](#6-required-policy-documents-checklist)
7. [Pre-Launch Compliance Checklist](#7-pre-launch-compliance-checklist)

---

## 1. LinkedIn Terms of Service Posture

### 1.1 The Core Legal Question: CFAA and hiQ v. LinkedIn

**Current state of law (as of May 2026):** The hiQ Labs v. LinkedIn Corp litigation established that scraping *publicly accessible* LinkedIn data does not violate the Computer Fraud and Abuse Act (CFAA), 18 U.S.C. § 1030. The Ninth Circuit's 2022 ruling held that accessing publicly available data cannot constitute "unauthorized access" under the CFAA because the data was not protected by an authentication gate. The Supreme Court declined to hear the case.

**Critical distinction for Mirror:** The hiQ rulings address *public* profile scraping by a third party acting on its own behalf. Mirror's architecture is meaningfully different and more defensible on several dimensions:

- The user is scraping **their own profile** using **their own session cookie**
- Mirror acts as the user's agent, not as an independent data aggregator
- The user provides affirmative consent and initiates the action
- The purpose is to help the user edit their own data, not to commercialize LinkedIn's data

**CFAA analysis for Mirror's Tier A scraping:** Under the CFAA, "unauthorized access" requires accessing a computer "without authorization" or "exceeding authorized access." A user is unambiguously authorized to access their own LinkedIn profile. When Mirror uses the user's session cookie at the user's direction, Mirror is acting as the user's agent. Agency law (Restatement (Third) of Agency § 2.01) supports the principle that an agent acting within scope of authority inherits the principal's access rights. This is a strong — though not bulletproof — legal position.

**[LAWYER REVIEW REQUIRED]** Whether courts will squarely adopt the agency theory in the context of automated scraping using delegated credentials has not been definitively litigated. LinkedIn may argue the ToS prohibits delegation of credentials regardless of purpose. Counsel should assess whether Mirror's model warrants a legal opinion before launch.

### 1.2 LinkedIn User Agreement Analysis

LinkedIn's User Agreement (current version) contains the following directly relevant prohibitions:

- Section 8.2: "You agree that you will not... use bots or other automated methods to access the Services, add or download contacts, send or redirect messages."
- Section 8.2: "Scrape or crawl the Services unless... permitted by LinkedIn."
- Section 8.2: "Share your password... or let anyone else access your account."

**The credential-sharing prohibition is the primary ToS risk.** When a user provides Mirror their session cookie, this may be characterized by LinkedIn as sharing account access credentials with a third party in violation of Section 8.2, regardless of the user's consent or beneficial purpose.

**Risk assessment for Tier A (session cookie):** HIGH ToS risk; MODERATE legal risk. LinkedIn is unlikely to pursue individual users in court, but retains the right to terminate accounts that use automated tools. Account termination is a significant user-facing risk that Mirror must disclose clearly. LinkedIn has historically enforced ToS violations by account suspension, not litigation, for individual users.

**Risk assessment for Tier B (PDF upload):** LOW risk. Accepting a PDF export or "Save to PDF" of a LinkedIn profile involves no automated access, no credential sharing, and no technical circumvention. This is defensible as user-controlled data export.

**Risk assessment for Tier C (Chrome extension DOM reading):** LOWER than Tier A but still non-zero. The extension reads the LinkedIn DOM in the user's browser session, at the user's direction, while the user is logged in through normal means. This is analogous to a browser bookmark that reads page content — there is no credential delegation to a third-party server. However, LinkedIn's ToS still prohibits automated interaction with its services. The extension should avoid simulating clicks or keystrokes beyond what the user explicitly triggers.

### 1.3 Chrome Extension vs. Server-Side Scraping: ToS Risk Differential

| Dimension | Server-Side (Tier A) | Chrome Extension (Tier C) |
|---|---|---|
| Credential delegation | User sends cookie to Mirror's servers | No credential leaves the user's browser |
| Network traffic origin | Mirror's servers (detectable as non-human) | User's browser (indistinguishable from normal browsing) |
| ToS "sharing credentials" risk | High — cookie is transmitted off-device | Low — cookie never leaves the browser |
| CFAA unauthorized access risk | Low (agency theory applies) | Very low (user is directly authenticated) |
| LinkedIn detection and enforcement risk | Moderate (server IP patterns detectable) | Low (normal browser traffic) |
| Account suspension risk to user | Present | Low |

**Recommendation:** Position the Chrome extension (Tier C) as the primary and preferred data acquisition method. Tier A (session cookie) should be positioned as an alternative with explicit risk disclosure. Tier B (PDF) is the safest fallback and should remain available.

### 1.4 The Spec's Non-Negotiable: "No LinkedIn Profile-Edit API"

The spec states: *"Never claim a LinkedIn profile-edit API exists — it does not, for third parties."* The Chrome extension's assisted-edit commit mechanism (filling LinkedIn's own edit UI fields at the user's direction) is a legally and technically honest approach. It does not claim an API integration that doesn't exist. This framing is important:

- The extension assists the user in editing their own profile through LinkedIn's native interface
- The user confirms each field change
- Mirror is not masquerading as an official LinkedIn integration
- This is consistent with honest marketing and avoids false advertising liability

### 1.5 Recommended ToS and Onboarding Language

The following principles, not templates, should guide the lawyers who draft the actual language:

**Disclosure of ToS risk:** Onboarding must include a plain-language disclosure that using a session cookie to import profile data may technically violate LinkedIn's User Agreement, that LinkedIn may suspend accounts found using automated tools, and that Mirror recommends the Chrome extension (Tier C) or PDF upload (Tier B) as alternatives. Users must affirmatively acknowledge this risk before providing a session cookie.

**Agency framing:** The terms should clearly establish that when Mirror accesses LinkedIn on the user's behalf, it does so solely as the user's agent, at the user's direction, to retrieve data the user already owns.

**Data ownership acknowledgment:** Users should acknowledge that their LinkedIn profile data is their own and that Mirror's retrieval of it is for their benefit, not for Mirror's commercial data collection purposes (separate from the §6.7 B2B offering, which requires its own disclosure — see Section 3).

**No guarantee of continued functionality:** Terms must disclaim that LinkedIn may change its platform or enforcement posture in ways that break Mirror's functionality, and Mirror cannot guarantee continued ability to import LinkedIn data via session cookie.

---

## 2. GDPR / CCPA Compliance — AI History Imports

### 2.1 Classification of AI Export Data Under GDPR

ChatGPT and Claude conversation export files are unambiguously "personal data" under GDPR Article 4(1). They contain:

- The user's natural language, reflecting their thoughts, opinions, and expressions (personal data; potentially sensitive data under Article 9 if conversations touch on health, politics, religion, or sexual orientation)
- Inferred characteristics (vocabulary patterns, writing style, values, interests)
- Potentially third-party personal data (references to colleagues, family members, clients)

**This makes Mirror a data controller** under GDPR Article 4(7) for all processing of these import files. Mirror determines the purposes and means of processing. Anthropic, as the AI provider processing the data to generate outputs, is a data processor under Article 4(8) and a sub-processor of Mirror's obligation.

### 2.2 Lawful Basis for Processing Each Data Type

| Data Type | Recommended Lawful Basis | GDPR Article | Notes |
|---|---|---|---|
| Account creation data (email, name) | Performance of contract | Art. 6(1)(b) | Necessary to provide the service |
| Life story interview transcript | Consent | Art. 6(1)(a) | User initiates; must be freely given, specific, informed, unambiguous |
| ChatGPT/Claude export files | Consent | Art. 6(1)(a) | User uploads voluntarily; explicit consent required before processing |
| LinkedIn profile data (Tier A/B/C) | Performance of contract | Art. 6(1)(b) | Necessary to perform the profile rewriting service |
| Voice Card (extracted from import) | Consent | Art. 6(1)(a) | Derived from upload; consent for original covers derivative unless re-specified |
| Outcome tracking data (views, messages) | Consent | Art. 6(1)(a) | Optional feature; requires separate granular consent |
| Benchmark corpus profiles (§6.1) | Legitimate interests | Art. 6(1)(f) | Public profiles; requires legitimate interests assessment (LIA) — see §2.7 |
| B2B aggregate data (§6.7) | Consent (if not truly anonymous) | Art. 6(1)(a) | See Section 3 |
| Payment data | Performance of contract + Legal obligation | Art. 6(1)(b)(c) | Stripe handles as separate controller |

**[LAWYER REVIEW REQUIRED]** Using "legitimate interests" as the basis for the benchmark corpus (§6.1) requires a documented Legitimate Interests Assessment (LIA) balancing Mirror's business interests against data subjects' rights. Public LinkedIn profiles were posted with limited expectations; scraping for commercial use without consent is contested in the EU. Legal counsel should assess whether a LIA supports this or whether consent (impractical for 5,000 public profiles) is required. Alternatively, counsel should assess whether these profiles fall under the GDPR's "publicly available data" provisions.

### 2.3 Special Category Data Risk

AI conversation exports frequently contain information about health, political opinions, religious beliefs, and sexual orientation — all Special Category data under GDPR Article 9. Processing such data requires:

- **Explicit consent** (Article 9(2)(a)) — a higher standard than ordinary consent; must be "explicit" not merely implied
- **Data Protection Impact Assessment (DPIA)** (Article 35) — systematic processing of Special Category data triggers mandatory DPIA

**Practical implication:** Mirror must implement content scanning or user acknowledgment flows that address the possibility of Special Category data in uploaded conversation files. The simplest approach is explicit consent language at upload that specifically names the possibility of sensitive data categories. A blanket "we may process sensitive data" disclosure is not sufficient under Article 9.

**[LAWYER REVIEW REQUIRED]** Whether Mirror can implement a "process and immediately delete sensitive categories after Voice Card extraction" approach to reduce ongoing Special Category exposure should be reviewed by EU data protection counsel.

### 2.4 Data Minimization and the Voice Card Architecture

GDPR Article 5(1)(c) requires personal data to be "adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed" (data minimization). The spec's Voice Card architecture — extracting vocabulary fingerprints, writing patterns, and stylistic markers from import files — is well-positioned for compliance if implemented correctly:

**What to store:**
- The Voice Card (structured extract): vocabulary patterns, sentence-length distributions, writing register, recurring topics as abstract categories
- Embeddings of the Voice Card (mathematical representations, not raw text)

**What to discard after Voice Card extraction:**
- The raw ChatGPT/Claude export ZIP file — delete from object storage after successful parsing
- Individual conversation text — do not persist the full conversation corpus
- Any Special Category data identified during extraction — must not be stored in Voice Card

**What to never store:**
- Session cookies after the scraping job completes (spec already mandates encrypted storage with user-revocable deletion; confirm zero-persistence after use)
- Raw HTML of LinkedIn profile beyond the duration of the current generation pipeline run

**Retention schedule to implement:**
- Raw import files (ZIP): delete within 24 hours of successful Voice Card extraction
- LinkedIn snapshot raw HTML: delete within 24 hours of parsed JSON creation; retain `linkedin_snapshots.parsed` for 2 years or until user deletion request
- Interview transcripts: retain while account is active plus 30 days post-deletion; user may request earlier deletion
- Voice Card + embeddings: retain while account is active; delete on erasure request
- Generations and rationale: retain while account is active; user may request deletion of individual generations

### 2.5 Right to Erasure (GDPR Article 17) — "Delete Everything" Flow

The spec's "delete everything" one-click flow is a strong compliance signal. To satisfy Article 17, the deletion must be:

- **Complete:** All tables in the data model must be covered — `users`, `interviews`, `imports`, `linkedin_snapshots`, `generations`, `commits`, `outcomes`, `outcome_deltas`. The spec's schema must be audited against the deletion procedure to confirm no orphaned records.
- **Including derived data:** Voice Card extracts, embeddings in pgvector, and any cached generations must be deleted, not just the source files.
- **Including third-party sub-processors:** If Anthropic's API logs conversations (check Anthropic's data processing terms — they do not use API data for training by default but may retain logs), Mirror must either ensure those are deleted or disclose the retention limitation to users.
- **Timely:** Article 17 requires deletion "without undue delay" — implement within 30 days maximum; ideally within 72 hours for a SaaS product of this type.
- **Verifiable:** The deletion must be logged (without logging PII) in an audit trail so Mirror can respond to regulatory inquiries confirming deletion was performed.

**Exceptions to erasure** (Article 17(3)) that may apply:
- Legal claims: Mirror may retain data necessary for active legal proceedings
- Legal obligations: Stripe transaction records have independent retention requirements under financial regulation (typically 7 years)

**Gap identified:** The spec describes a "delete everything" button but does not specify the deletion cascade across all tables. The Security Engineer's threat model and the schema migration must include a documented deletion procedure tested against all tables. This must be tested in CI.

**Realised approach — redaction-in-place ("soft delete"):** As of 2026-05-31 (ADR-009 in `ARCHITECTURE.md`, issue #16), "delete everything" is implemented as **redaction of the `users` row plus deletion of every PII-bearing child row**, not as `DELETE FROM users`. The reason is structural: `audit_log.accessor_id` is `NOT NULL ON DELETE RESTRICT` — required by the threat model so that every PII read is permanently attributable to a non-deletable accessor — which makes a true hard delete impossible the moment any user has performed a PII read against their own data.

Specifically, `src/lib/db/delete-user.ts` `deleteUser(userId)` in a single transaction:

- Deletes all rows in `interviews`, `imports`, `linkedin_snapshots`, `generations`, `commits`, `outcomes`, `outcome_deltas`, `llm_spend_ledger` where `user_id = <id>` (each table's `ON DELETE CASCADE` from `users` is honoured implicitly; child-of-child rows are removed by their own cascades).
- Updates `users` to redact PII: `email = 'deleted+<id>@deleted.invalid'`, `clerk_id = 'deleted:<id>'`, `voice_profile_id = NULL`, `plan = 'deleted'`. The `users.id` primary key is preserved.
- Leaves `audit_log` untouched.

Counsel-facing rationale: GDPR Article 4(1) defines personal data as information relating to *an identified or identifiable natural person*. After redaction the surviving `users.id` row is an internal opaque identifier with no remaining link to a natural person (the Clerk identity is separately revoked by the route handler, and Clerk holds the only directory mapping that identifier to a person). The audit-log entries the redacted row still anchors are records *about* the now-erased subject, written for the purpose of GDPR Article 30 RoPA and security incident response — they are processed under the lawful basis of legal obligation (Art. 6(1)(c)) and the data they contain about the subject is the row-id and column-name of the read, not the underlying PII.

This posture is **draft and requires lawyer review before launch** ([LAWYER REVIEW REQUIRED]). In particular, EU counsel should confirm whether the redacted `users` row plus retained audit rows satisfies Art. 17 in the regulator's view, or whether the more defensive Option 4 (audit-log archive + true `DELETE`) is needed. If the latter, ADR-009 explicitly notes that the current state is reachable from the future state — Option 4 can be layered on without re-architecting.

### 2.6 Data Processing Agreement with Anthropic

**Yes, Mirror requires a DPA with Anthropic.**

Under GDPR Article 28, when a controller (Mirror) engages a processor (Anthropic) to process personal data on its behalf, a Data Processing Agreement must be in place before processing begins.

When Mirror sends a user's Voice Card, LinkedIn profile data, and interview transcript to the Anthropic API for profile generation, Anthropic processes personal data on Mirror's behalf. This is unambiguously a controller-processor relationship.

**Anthropic's DPA status:** Anthropic offers a Data Processing Agreement for API customers. Mirror must:

1. Review Anthropic's current DPA (available through Anthropic's enterprise/API terms portal)
2. Confirm the DPA covers all data types Mirror sends (personal profile data, writing samples, Voice Card)
3. Confirm Anthropic's sub-processor list and that those sub-processors have adequate protections
4. Confirm whether Anthropic processes data outside the EU and, if so, what transfer mechanism applies (Standard Contractual Clauses, adequacy decision, or Binding Corporate Rules)

**[LAWYER REVIEW REQUIRED]** If Anthropic's standard DPA does not fully cover Mirror's processing activities, a negotiated DPA addendum may be required. This is a prerequisite to EU launch — no EU user data should flow to the Anthropic API without a valid DPA.

### 2.7 Cross-Border Data Transfer

Anthropic's API endpoints are US-based. Sending EU user personal data to a US processor requires a valid transfer mechanism under GDPR Chapter V:

- **EU-US Data Privacy Framework:** As of 2026, the EU-US DPF provides an adequacy mechanism for US companies that self-certify. Check whether Anthropic participates in the EU-US DPF.
- **Standard Contractual Clauses (SCCs):** If Anthropic is not DPF-certified or the DPF is challenged, SCCs (2021 EU Commission decision, Modules 2/3) must be incorporated into the DPA.
- **Supplementary measures:** Following the Schrems II decision (C-311/18), SCCs alone may be insufficient if US intelligence laws create a real risk of access. A Transfer Impact Assessment (TIA) should be conducted for the Anthropic transfer.

**[LAWYER REVIEW REQUIRED]** The TIA for the Anthropic transfer requires EU data protection counsel. This is a prerequisite for EU launch.

### 2.8 GDPR Record of Processing Activities (Article 30)

Mirror must maintain an internal Record of Processing Activities (RoPA) covering each processing operation. This is a mandatory internal document (not published) for organizations that process personal data regularly. The RoPA must include, for each processing activity:

- Name and contact of the controller (Mirror) and DPO (if appointed)
- Purposes of processing
- Categories of data subjects and personal data
- Categories of recipients (sub-processors)
- International transfers and safeguards
- Retention periods
- Security measures

**DPO obligation:** GDPR Article 37 requires appointment of a Data Protection Officer when processing involves "large-scale" systematic processing of Special Category data. At launch scale, a DPO may not be legally mandatory for Mirror. However, if AI import processing regularly touches Special Category data (health, political opinion in AI conversations), counsel should advise. Designating a privacy contact person (even without the formal DPO title) and publishing contact information is good practice and reduces regulatory friction.

### 2.9 CCPA Obligations for California Users

California Consumer Privacy Act (Cal. Civ. Code §§ 1798.100 et seq.) as amended by CPRA applies to Mirror if Mirror meets any of:
- Annual gross revenues exceeding $25 million
- Annually buys, sells, or shares personal information of 100,000+ California consumers
- Derives 50%+ of annual revenues from selling personal information

At launch, Mirror likely does not meet the revenue thresholds. However, the B2B data sale described in §6.7 may trigger the "selling personal information" threshold earlier than expected if data is characterized as "personal information" under CCPA (which has a broader definition than GDPR and includes inferred characteristics). Mirror should implement CCPA compliance from launch regardless of current thresholds because:

- Retrofitting CCPA compliance is costly
- The privacy policy must reflect CCPA rights regardless of whether the thresholds are met, as a matter of user trust
- The CPRA created the California Privacy Protection Agency (CPPA) which actively enforces

**CCPA rights to implement:**
- Right to Know: disclosure of categories of personal information collected, sold, or shared (with specific disclosure of the §6.7 B2B data use)
- Right to Delete: must honor within 45 days
- Right to Opt-Out of Sale or Sharing: the §6.7 B2B aggregate data sale may constitute "selling" or "sharing" personal information under CCPA even if anonymized — see Section 3
- Right to Correct
- Right to Limit Use of Sensitive Personal Information: writing style from AI conversations may qualify as "sensitive personal information" under CPRA

**"Do Not Sell or Share My Personal Information" link** must appear in the footer of the Mirror website if the §6.7 offering involves sale or sharing of California user data.

---

## 3. Recruiter-Side B2B Data Disclosures (§6.7)

### 3.1 The Nature of the §6.7 Offering

Section 6.7 describes: "Sell aggregated anonymized 'what's working in profiles in your field right now' to recruiting teams." This involves:

1. Analyzing patterns across Mirror users' profile rewrites and outcomes
2. Identifying which profile elements correlate with positive outcomes (recruiter messages, view lift)
3. Packaging and selling these insights to recruiting teams as B2B data products

This is a secondary commercial use of user data beyond the primary service (profile rewriting). It requires specific legal treatment.

### 3.2 Anonymization Standard Under GDPR

"Anonymized data" is excluded from GDPR scope entirely — but only if it is truly anonymous such that re-identification is not reasonably possible. The EU standard (Opinion 05/2014 on Anonymisation Techniques, Article 29 Working Party, now EDPB) is demanding:

**True anonymization requires:**
- Singling out: impossible to isolate a person in the dataset
- Linkability: impossible to link records relating to the same individual
- Inference: impossible to deduce information about an individual

**Aggregated "what's working" data is likely anonymous if:**
- Data is aggregated across a minimum group size (commonly accepted floor: k-anonymity with k ≥ 5, often k ≥ 10 for employment data which is more sensitive)
- No individual's data can be singled out from the aggregate statistics
- The data product does not reveal information about specific industries or roles that are so narrowly defined that reverse identification is possible (e.g., "VP of Engineering at Series B fintech in Berlin" may be identifiable even without a name)
- Outcome data is expressed as ranges or percentages, not absolute numbers that could triangulate to individuals

**Pseudonymized data is NOT anonymous** under GDPR and remains personal data. If Mirror's B2B product involves any linking of outcomes back to profile characteristics in a way that could theoretically re-identify individuals (even probabilistically), it remains personal data subject to full GDPR obligations.

**[LAWYER REVIEW REQUIRED]** Before launching the §6.7 B2B offering, a formal anonymization technical assessment must be conducted by a qualified data protection expert. The assessment must apply the Article 29 WP anonymization criteria to Mirror's specific data architecture. If the data cannot be certified as truly anonymous, the B2B offering requires:
- Explicit user consent (Article 6(1)(a)) specifically for the B2B data use
- Disclosure in the privacy policy and ToS
- An opt-out mechanism at minimum

### 3.3 CCPA and the "Sale" of Aggregate Data

Under CCPA §1798.140(t), "selling" personal information includes disclosing it for monetary consideration. If Mirror's aggregate data retains any element of "personal information" as defined by CCPA (which includes "inferences drawn from any of the information identified... to create a profile about a consumer"), selling it to recruiting teams constitutes a "sale" triggering:

- Right to opt-out for California consumers
- "Do Not Sell or Share My Personal Information" link requirement
- Category disclosure in the privacy policy

Even if Mirror believes the data is anonymized, the safest legal position is to treat the B2B offering as a "sale" of data for CCPA purposes and provide opt-out rights, rather than to rely on an anonymization defense that may not survive regulatory scrutiny.

### 3.4 Required User-Facing Disclosures for §6.7

The following disclosures are required before the B2B offering launches, at minimum:

**In the Privacy Policy:**
- Explicit description of the B2B data use: aggregated, anonymized analysis of profile characteristics and outcomes is provided to recruiting teams as a commercial data product
- Category of recipients (recruiting teams, staffing companies)
- Anonymization methodology described at a high level
- User's right to opt out of having their data included in the B2B product

**In the Terms of Service:**
- Commercial use disclosure: Mirror's business model includes selling aggregate insights derived from user activity
- Opt-out mechanism: users may opt out of contributing data to the B2B product without losing access to the core service (otherwise GDPR consent is not "freely given")
- Confirmation that opt-out does not affect the primary service

**Onboarding consent:**
- If relying on consent as the legal basis, a specific, separate consent checkbox for the B2B data use during onboarding or as an explicit toggle in account settings
- The consent must be distinct from the consent to use Mirror — bundled consent is not valid under GDPR

**[LAWYER REVIEW REQUIRED]** The decision between consent and legitimate interests as the legal basis for the B2B offering has significant architectural implications. Legitimate interests requires a documented LIA; consent requires granular consent management and opt-out infrastructure. Counsel should advise on which basis is more defensible and practical for Mirror's business model.

---

## 4. EU AI Act Transparency Obligations

### 4.1 Applicable Framework

The EU AI Act (Regulation (EU) 2024/1689) entered into force on August 1, 2024, with obligations applying in phased timelines:
- Prohibited AI practices: applied from February 2, 2025
- High-risk AI system obligations: apply from August 2, 2026
- General-purpose AI model obligations: apply from August 2, 2025

Mirror will be subject to EU AI Act obligations for EU users. The key questions are: (1) what classification applies, and (2) what disclosure obligations result.

### 4.2 Is Mirror a High-Risk AI System?

EU AI Act Annex III lists categories of high-risk AI systems. Relevant categories for Mirror:

**Annex III, Category 4: Employment, workers management, and access to self-employment**

> "AI systems intended to be used for recruitment or selection of natural persons, notably for advertising vacancies, screening or filtering applications, evaluating candidates in the course of interviews or tests..."

> "AI systems intended to be used for making decisions affecting terms and conditions of the employment relationship, including promotions, assignments, monitoring..."

**Analysis:** Mirror's primary function is helping users optimize their LinkedIn profiles to attract recruiters and get hired. The direct output — a rewritten LinkedIn profile — is used in the context of employment seeking and recruitment. The recruiter-side B2B offering (§6.7) explicitly targets recruiting teams who use the data to make recruitment decisions.

**Likely classification: HIGH-RISK under Annex III, Category 4**, at minimum for the recruiter-facing B2B product. The consumer-facing product (helping job seekers optimize their own profiles) presents a closer question but the employment context is clearly present.

**[LAWYER REVIEW REQUIRED]** Classification as a high-risk AI system under the EU AI Act carries substantial obligations. Legal counsel with EU AI Act expertise must advise on whether Mirror's specific use case falls within Annex III Category 4 and whether any Article 6(3) exception applies (notably the exception for AI systems used by natural persons for their own use). The self-use exception may apply to the consumer product but almost certainly not to the B2B product.

### 4.3 High-Risk AI System Obligations (if classified as high-risk)

If Mirror is classified as a high-risk AI system under Annex III, the following obligations apply under EU AI Act Title III:

**Technical documentation (Article 11 + Annex IV):**
- General description of the AI system and its intended purpose
- Description of the elements of the AI system and of the process for its development
- Information on the training, validation, and testing data used
- Description of the human oversight measures implemented
- Information about the computational resources required

**Conformity assessment (Article 43):**
- For Annex III Category 4 systems: self-assessment is permitted (no third-party notified body required) for the first category
- A Declaration of Conformity (Article 47) must be drawn up
- Registration in the EU database (Article 49) is required before market placement

**Logging and record-keeping (Article 12):**
- Technical logging capabilities throughout the system lifecycle
- Audit log of operations during the period when the high-risk AI system is in use

**Transparency and information to users (Article 13):**
- Sufficient transparency to enable deployers to interpret the AI system's output
- Instructions for use including: identity and contact of provider, capabilities and limitations, circumstances that could lead to risks, human oversight measures

**Human oversight (Article 14):**
- Technical measures enabling human oversight
- Users (job seekers using Mirror) must be able to understand, verify, and challenge outputs
- Mirror's walkthrough diff view with per-section accept/reject satisfies much of this requirement — document this explicitly

**Accuracy, robustness, and cybersecurity (Article 15):**
- Appropriate levels of accuracy, resilience, and cybersecurity

**[LAWYER REVIEW REQUIRED]** The conformity assessment process and registration in the EU AI database require legal counsel to advise on filing requirements, timing, and documentation standards. This is an obligation that cannot be self-administered without legal guidance.

### 4.4 General Transparency Obligations (Article 50 — GPAI-Generated Content)

Even if Mirror is not classified as high-risk (or pending that determination), Article 50 of the EU AI Act imposes transparency obligations on AI-generated content:

**Article 50(1) — Disclosure of AI interaction:** Persons deploying an AI system that interacts with natural persons must disclose that the person is interacting with an AI system, unless it is obvious.

**Article 50(4) — Synthetic content:** Providers of AI systems that generate synthetic text, images, audio, or video must ensure the output is marked in a machine-readable format as AI-generated (except where prohibited or for minor processing).

**Application to Mirror:** Mirror uses Claude to generate rewritten LinkedIn profile text that users will publish as their own professional self-representation. The EU AI Act raises the question of whether this "synthetic content" disclosure requirement applies to text that a user intends to present as their own authentic professional description.

**Analysis:** Article 50(4) targets "deep fakes" and mass-generated content, not AI writing assistance for individual users. The recitals indicate the intent is to prevent public deception at scale. When a user:
- Reviews the AI-generated text in the walkthrough
- Accepts, rejects, or edits individual sections
- Commits the final version as their own profile

...the user is exercising genuine authorship over the final content. The AI is a tool, not the author. This is analogous to using a spell-checker, a ghostwriter, or LinkedIn's own AI writing suggestions — none of which trigger synthetic content disclosure requirements.

**However:** Mirror should not claim the AI-generated drafts are entirely the user's original work in its marketing. Disclosing that Mirror uses AI to generate profile content suggestions (as the product clearly does) is both ethically appropriate and likely sufficient to satisfy Article 50 transparency requirements for this use case.

**Practical implementation:** The disclosure should appear prominently in the UI ("Mirror uses Claude AI to generate your rewritten profile drafts") and in the privacy policy. This is already implicit in Mirror's product design but should be made explicit in user-facing language.

### 4.5 Does Mirror Trigger Prohibited AI Practice Concerns?

EU AI Act Article 5 prohibits certain AI practices. One potentially relevant prohibition:

**Article 5(1)(b):** AI systems that exploit vulnerabilities of specific groups (e.g., socio-economic circumstances) in a manner that distorts behavior causing harm.

Mirror targets job seekers, who may be in economically vulnerable positions. The product should not:
- Create false urgency ("Profiles not updated with Mirror see 80% fewer recruiter contacts" without data)
- Exploit anxiety about employment insecurity to manipulate purchasing decisions
- Use dark patterns in conversion flows

The spec's explicit prohibition on "dark patterns" and "fake urgency" (§8) aligns with this requirement. Document this commitment in compliance documentation.

---

## 5. Payment and Subscription Compliance

### 5.1 US Federal and State Requirements

**Federal Trade Commission (FTC) — Negative Option Rule (16 C.F.R. Part 425, updated 2024):**

The FTC's updated Negative Option Rule (effective 2024) requires for subscription products:

- **Clear and conspicuous disclosure** of all material subscription terms before purchase, including: recurring charge amount, billing frequency, cancellation process, and trial auto-conversion terms
- **Disclosure placement:** immediately adjacent to the payment button, not buried in terms
- **Explicit consent:** a checkbox or affirmative action confirming the user understands the recurring charge (checking "I agree to the Terms of Service" is not sufficient for subscription consent)
- **Simple cancellation:** cancellation must be as easy as sign-up — if sign-up is online, cancellation must be online; not require a phone call or email
- **Immediate confirmation:** email confirmation of enrollment must be sent after subscription enrollment, with clear cancellation instructions

**Mirror's $29/month subscription:**
- Checkout must display: "$29.00/month, billed monthly, cancel anytime" before the purchase button
- A dedicated "cancel anytime" mechanism must exist in account settings (not hidden)
- Email confirmation of subscription enrollment must be sent immediately
- If a free trial precedes billing, the trial end date and first charge date must be disclosed at sign-up

**Mirror's $79 one-time deep rewrite:**
- Clearly labeled as a one-time charge
- No auto-renewal ambiguity
- Receipt email required

### 5.2 US State-Level Auto-Renewal Laws

California (Cal. Bus. & Prof. Code §§ 17600-17606) has the most stringent auto-renewal law in the US:

- Subscription terms must be presented in a "clear and conspicuous" manner before checkout
- Positive consent required (checkbox specifically acknowledging the auto-renewal terms)
- Acknowledgment email must include cancellation instructions and a cost-free cancellation mechanism
- If an initial offer includes a free trial or discounted introductory period, the post-trial price must be disclosed before sign-up

Other states with auto-renewal statutes: New York, Illinois, Delaware, Vermont, Hawaii, and others. The California standard is the most demanding; complying with California generally ensures compliance in other states.

**[LAWYER REVIEW REQUIRED]** Stripe's Checkout and Billing products include built-in disclosure mechanisms, but Mirror must configure them correctly for multi-state compliance. Confirm with US counsel that the chosen Stripe checkout configuration satisfies California and other state auto-renewal requirements.

### 5.3 EU Consumer Protection Requirements

**EU Consumer Rights Directive (2011/83/EU) and Digital Content Directive (2019/770/EU):**

For EU users purchasing digital services (subscription or one-time):

- **Pre-contractual information:** Before payment, Mirror must clearly display: total price including all applicable taxes, subscription duration and auto-renewal terms, right of withdrawal explanation
- **Right of withdrawal (14-day cooling-off period):** EU consumers have 14 days to withdraw from a digital service contract without reason. For digital content/services, this right can be waived by the consumer if they request immediate access. Mirror must present this waiver option correctly: "I consent to immediate access and acknowledge I lose my 14-day withdrawal right."
- **Checkout confirmation page:** Must include all material terms before the user clicks "buy" — EU courts have invalidated subscriptions where terms were in small print or a hyperlink not adjacent to the purchase button
- **VAT display:** Prices must include VAT for EU consumers (Stripe Tax handles calculation, but the price display must be VAT-inclusive for EU)

**EU Omnibus Directive (2019/2161/EU):**
- Prohibits fake reviews and false urgency claims ("Only 2 spots left!")
- Requires that promotional price claims ("50% off") reference an actual prior price in the EU

**Subscription Information Regulation (EU) 2022/2065 (Digital Services Act) — indirectly:**
- Platform transparency requirements may apply at scale; not immediately relevant at launch but should be monitored

---

## 6. Required Policy Documents Checklist

The following documents must be drafted by qualified legal counsel (not AI-generated templates) before Mirror accepts real users. This checklist identifies required content areas, not template documents.

### 6.1 Privacy Policy

**Status:** [ ] Not drafted  
**Required before:** First EU or California user  
**Required sections:**

- [ ] Identity and contact details of the data controller (Mirror) and EU Representative if applicable
- [ ] Categories of personal data collected (enumerate each: account data, interview transcripts, AI import files, LinkedIn data, Voice Cards, outcome data)
- [ ] Legal basis for each processing activity (consent, contract, legitimate interests) with specific articulation per GDPR Art. 13(1)(c)
- [ ] Purposes of processing for each data category
- [ ] Retention periods for each data category (must match the architecture in §2.4 of this document)
- [ ] Recipients and categories of recipients (Anthropic as sub-processor, Stripe, Clerk, PostHog, Cloudflare)
- [ ] International transfers and safeguards (Anthropic US transfer; SCC/DPF basis)
- [ ] GDPR data subject rights: access, rectification, erasure, restriction, portability, objection, withdrawal of consent
- [ ] CCPA rights: know, delete, opt-out of sale/sharing, correct, limit sensitive PI use
- [ ] B2B data use disclosure (§6.7) with opt-out mechanism
- [ ] Cookie policy reference or integrated cookie section
- [ ] Automated decision-making disclosure if any profiling affects users materially
- [ ] Contact information for privacy requests (email address and response time commitment)
- [ ] EU DPO contact if appointed; otherwise EU Representative contact (see §6.5)
- [ ] Policy effective date and update mechanism

### 6.2 Terms of Service

**Status:** [ ] Not drafted  
**Required before:** First paid user  
**Required sections:**

- [ ] Description of the service (what Mirror does and does not do)
- [ ] LinkedIn ToS risk disclosure (§1.4 of this document — user acknowledgment that session cookie use may violate LinkedIn's User Agreement)
- [ ] No affiliation with LinkedIn disclaimer
- [ ] No guarantee of LinkedIn profile-edit API (spec §8 requirement formalized in ToS)
- [ ] Chrome extension functionality and limitations
- [ ] User obligations (must own the LinkedIn profile being rewritten; must have right to upload the AI conversation files)
- [ ] Intellectual property: user retains ownership of their profile content; Mirror retains ownership of the service and its underlying models
- [ ] License grant: user grants Mirror license to process their data to provide the service
- [ ] B2B data use consent/disclosure (§6.7) — linked to or incorporated from Privacy Policy
- [ ] Subscription terms: billing, auto-renewal, cancellation process, refund policy
- [ ] Acceptable use restrictions (no scraping third-party profiles without consent, no use to create fraudulent profiles)
- [ ] Warranty disclaimers and limitation of liability
- [ ] Governing law and dispute resolution (specify jurisdiction — consider Delaware for US entity, Irish law for EU entity if establishing EU presence)
- [ ] EU consumer law compliance: right of withdrawal disclosure, waiver mechanism for digital content

### 6.3 Cookie Policy

**Status:** [ ] Not drafted  
**Required before:** First EU user  
**Required sections:**

- [ ] Categories of cookies: strictly necessary, functional, analytics, marketing
- [ ] Specific cookies listed by name with purpose and retention period
- [ ] Third-party cookies (PostHog, any advertising pixels — spec prohibits dark patterns so advertising cookies should be minimal)
- [ ] Consent mechanism: EU users must consent to non-essential cookies before they are set (ePrivacy Directive requirement; GDPR applies to consent mechanism)
- [ ] Consent withdrawal mechanism: as easy as consent (cookie preference center)
- [ ] Note: PostHog session replay on the walkthrough requires explicit disclosure and consent — session replay captures keystrokes and interactions and is treated as more privacy-invasive than standard analytics cookies

### 6.4 Data Processing Agreement with Anthropic

**Status:** [ ] Not executed  
**Required before:** Any EU user data is sent to the Anthropic API  
**Steps:**

- [ ] Review Anthropic's standard DPA on their API portal
- [ ] Confirm DPA covers all Mirror processing activities (profile data, interview transcripts, Voice Cards)
- [ ] Confirm sub-processor list and adequacy
- [ ] Confirm transfer mechanism for EU data (DPF or SCCs)
- [ ] Execute DPA (or negotiate addendum if standard DPA is insufficient)
- [ ] File in compliance documentation with execution date

**[LAWYER REVIEW REQUIRED]** DPA negotiation and review requires legal counsel. This document must be executed, not merely agreed to by clicking through API terms.

### 6.5 EU Representative

**Status:** [ ] Not determined  
**Required if:** Mirror processes EU personal data but has no EU establishment (i.e., Mirror is a US entity with no EU office or subsidiary)

Under GDPR Article 27, controllers and processors not established in the EU but processing EU personal data must designate an EU Representative in a Member State. The representative acts as a contact point for EU supervisory authorities and EU data subjects.

- [ ] Determine whether Mirror has EU establishment (EU registered entity, office, or employees in EU)
- [ ] If no EU establishment: appoint an EU Representative service (commercial services are available; typical cost €1,000-3,000/year)
- [ ] Publish EU Representative contact details in Privacy Policy
- [ ] Notify the relevant EU supervisory authority (DPA of the Member State where the representative is based)

**[LAWYER REVIEW REQUIRED]** The EU Representative requirement and selection of the appropriate Member State (which determines the "lead supervisory authority" for GDPR enforcement) requires legal counsel to advise given Mirror's business structure.

### 6.6 GDPR Record of Processing Activities (Internal — Article 30)

**Status:** [ ] Not created  
**Required before:** Processing EU personal data  
**This is an internal document, not published to users.**

Must document for each processing activity:
- [ ] Name of the processing activity
- [ ] Controller and DPO contact details
- [ ] Purposes of processing
- [ ] Description of data subjects and data categories
- [ ] Categories of recipients
- [ ] International transfers and safeguards
- [ ] Retention periods
- [ ] Description of technical and organizational security measures

Mirror's RoPA must cover at minimum: user onboarding, interview processing, AI import processing, LinkedIn scraping, profile generation, outcome tracking, and B2B analytics (§6.7).

---

## 7. Pre-Launch Compliance Checklist

The following must be completed before Mirror accepts its first paying user. Items are organized by priority: blocking items must be resolved before any user sign-up; important items must be resolved before EU users or paid users; recommended items should be completed within 90 days of launch.

### Blocking — Must Complete Before Any User Sign-Up

- [ ] **Retain US legal counsel** with experience in SaaS, privacy law (GDPR/CCPA), and tech transactions
- [ ] **Retain EU data protection counsel** (law firm or DPO-as-a-service) for GDPR compliance advisory
- [ ] **Execute DPA with Anthropic** before any user data is sent to the API
- [ ] **Draft and publish Privacy Policy** covering all GDPR and CCPA requirements (see §6.1)
- [ ] **Draft and publish Terms of Service** including LinkedIn ToS risk disclosure (see §6.2)
- [ ] **Implement and test "delete everything" flow** — cascade deletion across all tables; test in CI; audit log deletion events without logging PII
- [ ] **Implement explicit consent collection** at onboarding for AI import processing (Article 9 explicit consent for potential Special Category data)
- [ ] **Session cookie handling** — confirm libsodium encryption is implemented; confirm cookies are deleted after scraping job completes; implement user-revocable deletion
- [ ] **Stripe checkout configuration** — verify pre-checkout disclosure of subscription terms (amount, frequency, cancellation) satisfies FTC Negative Option Rule and California auto-renewal law
- [ ] **No raw import files in long-term storage** — implement 24-hour deletion of ZIP files after Voice Card extraction; test deletion job in CI
- [ ] **Cookie consent mechanism** — implement consent banner for EU users that withholds non-essential cookies (including PostHog analytics) until consent is given

### Important — Must Complete Before EU Users or Paid Users

- [ ] **EU Representative appointment** — if no EU establishment, appoint and publish EU Representative contact
- [ ] **Transfer mechanism for Anthropic** — confirm DPF certification or execute SCCs; conduct Transfer Impact Assessment
- [ ] **EU AI Act assessment** — obtain legal opinion on whether Mirror is a high-risk AI system under Annex III Category 4 before EU launch
- [ ] **GDPR Record of Processing Activities** — create internal RoPA covering all processing activities
- [ ] **Draft and publish Cookie Policy** — enumerate cookies, purposes, retention; implement consent withdrawal
- [ ] **EU checkout configuration** — VAT-inclusive pricing display, right of withdrawal disclosure and waiver mechanism for EU consumers
- [ ] **Data retention schedule implementation** — enforce retention periods in production via automated deletion jobs; test in CI
- [ ] **PostHog session replay disclosure** — explicit consent required for session replay; implement separate consent for walkthrough replay
- [ ] **DPA assessment for other sub-processors** — Clerk (auth/user data), Stripe (payment data), Cloudflare R2 (file storage) — confirm DPAs are in place with each

### Important — Must Complete Before B2B Launch (§6.7)

- [ ] **Anonymization technical assessment** — formal assessment by data protection expert before first B2B data sale
- [ ] **User consent or legitimate interests assessment for B2B use** — documented legal basis before any user data is included in B2B products
- [ ] **B2B opt-out mechanism** — implement in account settings; test that opt-out excludes user data from B2B products
- [ ] **Privacy Policy update** — add B2B data use section with opt-out instructions before B2B launch
- [ ] **ToS update** — disclose commercial data product in ToS before B2B launch
- [ ] **"Do Not Sell or Share" link** — if B2B data qualifies as "sale" under CCPA (consult counsel), add to website footer

### Recommended — Complete Within 90 Days of Launch

- [ ] **DPIA for AI import processing** — if Special Category data processing is regular, conduct and document a Data Protection Impact Assessment (Article 35)
- [ ] **Benchmark corpus legal review** — obtain legal opinion on whether collecting 5,000 public LinkedIn profiles for commercial use complies with GDPR and LinkedIn's ToS (§6.1); this is a separate ToS risk from user profile scraping
- [ ] **EU AI Act compliance documentation** — if classified as high-risk: technical documentation per Annex IV, Declaration of Conformity, EU database registration
- [ ] **Legitimate Interests Assessment for benchmark corpus** — if not relying on consent (impractical), document LIA for benchmark profile collection
- [ ] **Incident response procedure** — documented breach response procedure with 72-hour supervisory authority notification capability (GDPR Article 33)
- [ ] **Privacy training for team** — all team members handling personal data trained on obligations
- [ ] **Vendor sub-processor review** — complete DPA review for all vendors: Clerk, Neon (database), Railway (worker hosting), Inngest (job queue), Resend (email), PostHog
- [ ] **Regular compliance review cadence** — establish quarterly review of regulatory changes affecting Mirror

---

## Appendix: Regulatory Citations Reference

| Regulation | Jurisdiction | Key Articles Relevant to Mirror |
|---|---|---|
| GDPR (EU) 2016/679 | EU/EEA | Art. 4 (definitions), Art. 5 (principles), Art. 6 (lawful basis), Art. 7 (consent), Art. 9 (special categories), Art. 12-14 (transparency), Art. 15-22 (data subject rights), Art. 24-26 (controller obligations), Art. 28 (processor/DPA), Art. 30 (RoPA), Art. 33-34 (breach notification), Art. 35 (DPIA), Art. 37 (DPO), Art. 44-49 (transfers) |
| EU AI Act (EU) 2024/1689 | EU | Art. 5 (prohibited practices), Art. 6 + Annex III (high-risk classification), Art. 9-15 (high-risk obligations), Art. 47 (Declaration of Conformity), Art. 49 (registration), Art. 50 (transparency) |
| CCPA/CPRA Cal. Civ. Code § 1798.100 et seq. | California, US | §§ 1798.100 (right to know), 1798.105 (right to delete), 1798.120 (right to opt-out), 1798.125 (non-discrimination), 1798.135 (methods of opting out), 1798.140 (definitions) |
| FTC Act 15 U.S.C. § 45 | US | Section 5 unfair/deceptive practices; Negative Option Rule 16 C.F.R. Part 425 |
| CFAA 18 U.S.C. § 1030 | US | § 1030(a)(2) unauthorized access; hiQ v. LinkedIn 9th Cir. 2022 |
| Cal. Bus. & Prof. Code §§ 17600-17606 | California, US | Automatic renewal law |
| EU Consumer Rights Directive 2011/83/EU | EU | Art. 6 (pre-contractual information), Art. 9-16 (right of withdrawal), Art. 22 (digital content) |
| EU Digital Content Directive 2019/770/EU | EU | Conformity requirements for digital services |
| EU ePrivacy Directive 2002/58/EC | EU | Art. 5(3) consent for cookies; applies pending ePrivacy Regulation |

---

*Legal Compliance Checker — Mirror Compliance Analysis*  
*Assessment Date: 2026-05-12*  
*Next Review: Before EU launch or B2B launch (whichever is first); then quarterly*  
*Status: Requires review by qualified US and EU legal counsel before implementation*
