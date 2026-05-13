# Profile Generation Rubric

## Dimensions (each scored 1–5 unless noted as pass/fail)

### 1. Voice Fidelity (1–5)
Does the generated profile sound like the person described in their Voice Card?
- **5** — Indistinguishable from how the person writes; vocabulary, cadence, and register match.
- **4** — Clearly the same voice; minor deviations that don't jar.
- **3** — Recognizable but generic in places.
- **2** — Generic LinkedIn voice; Voice Card ignored.
- **1** — Sounds like a different person or AI-written boilerplate.

**Pass threshold: >= 4**

### 2. Factual Accuracy (pass/fail)
Does the generated profile introduce ANY information not present in the input (job titles, companies, skills, metrics)?
- **Pass** — All facts are directly traceable to the input.
- **Fail** — Any hallucinated fact present.

### 3. Recruiter-Eye Lift (1–5)
Would a recruiter find the new profile meaningfully more compelling than the original?
- **5** — Dramatically stronger headline, hook, and proof points.
- **4** — Clearly better; more specific and differentiated.
- **3** — Somewhat better.
- **2** — Marginal improvement.
- **1** — No improvement or worse.

**Pass threshold: >= 3**

### 4. Benchmark Exemplar Citation (pass/fail)
Does the rationale block cite which exemplar pattern informed each major section?
- **Pass** — At least 3 sections cite an exemplar.
- **Fail** — Fewer than 3 citations.

### 5. Structural Completeness (pass/fail)
Does the output contain all required JSON keys: `headline`, `about`, `experiences`, `skills`, `featured`, `rationale`?
- **Pass** — All keys present.
- **Fail** — Any key missing.

## Regression gate
A prompt version may be merged only if it scores **>= baseline on ALL five dimensions** across the 20 seed personas.
