# Voice Fidelity Rubric (standalone)

Used by the Voice Match Score (§6.3) and the profile generation eval.

## Scoring (1–5)
Rate how well the generated text matches the Voice Card's vocabulary, cadence, and emotional register.

| Score | Criteria |
|-------|----------|
| 5 | Signature phrases, preferred vocabulary, and sentence rhythm all match. A reader who knows this person would believe they wrote it. |
| 4 | Clear match in register and vocabulary; one or two lapses that don't break the effect. |
| 3 | Recognizable voice in places; generic filler in others. |
| 2 | Generic LinkedIn voice. Voice Card mostly ignored. |
| 1 | Sounds AI-written or like a different person. |

## Calibration pairs (human-labeled, Wk 4)
Add 50 labeled pairs here once the Voice Match Score implementation begins.
Spearman correlation between model scores and human labels must reach >= 0.7 before the feature ships.
