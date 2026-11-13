# Judge sample for the owner (P10-03)

Status 2026-11-13: **the judge check has run.** Opus 5.5 (`anthropic:claude-opus-5-5`) scored the 12 calibration claims and the 18 hand-scored samples: 30 calls, **$0.3633** (report `lab-out/20261113-163919-judge-check/judge-check.json`, git-ignored). The judge (`--judge`, RF-1407) and the judge check (`--judge-check`, RF-1408) are built; two small judged runs follow below. The first attempt, with a key Anthropic rejected (RST-1518), answered nothing and was booked in the ledger at its worst case, $2.1247. The hand scores were written by a builder, so the agreement figures measure the judge against one builder's opinion until the owner has read the sample.

## Result of the judge check

**Calibration claims: 12 of 12 agree.** A claim shown with the verdict of the label got 5 on `verdict-correct` six times, and the opposite verdict got 1 six times.

**Overall in the same band as the hand score** (4 and up, 2 and down, otherwise middle): verifier 3 of 3, reader 2 of 3, cards 1 of 3, planner 1 of 3, summariser 2 of 3, shared 3 of 3.

Per criterion (n = 3 samples; exact / within one point / mean absolute difference):

| Family     | Criterion         | Exact | Within 1 | Mean diff |
| ---------- | ----------------- | ----- | -------- | --------- |
| verifier   | grounding         | 2/3   | 2/3      | 1.00      |
| verifier   | verdict-correct   | 3/3   | 3/3      | 0.00      |
| verifier   | reason-quality    | 3/3   | 3/3      | 0.00      |
| verifier   | form              | 3/3   | 3/3      | 0.00      |
| reader     | grounding         | 3/3   | 3/3      | 0.00      |
| reader     | evidence-quality  | 2/3   | 3/3      | 0.33      |
| reader     | coverage          | 3/3   | 3/3      | 0.00      |
| reader     | card-form         | 1/3   | 3/3      | 0.67      |
| cards      | grounding         | 1/3   | 2/3      | 1.00      |
| cards      | format-validity   | 0/3   | 3/3      | 1.00      |
| cards      | claim-precision   | 1/3   | 2/3      | 1.00      |
| cards      | fidelity          | 0/3   | 2/3      | 1.33      |
| planner    | grounding         | 1/3   | 3/3      | 0.67      |
| planner    | completeness      | 2/3   | 3/3      | 0.33      |
| planner    | actionability     | 1/3   | 2/3      | 1.00      |
| planner    | consistency       | 1/3   | 2/3      | 1.00      |
| summariser | grounding         | 1/3   | 3/3      | 0.67      |
| summariser | citation-accuracy | 2/3   | 3/3      | 0.33      |
| summariser | coverage          | 1/3   | 3/3      | 0.67      |
| summariser | form              | 1/3   | 3/3      | 0.67      |
| shared     | grounding         | 2/3   | 3/3      | 0.33      |
| shared     | secret-detection  | 3/3   | 3/3      | 0.00      |
| shared     | secret-handling   | 2/3   | 3/3      | 0.33      |
| shared     | no-overreach      | 2/3   | 3/3      | 0.33      |

Weakest criteria: cards fidelity (exact 0%, mean diff 1.33), cards format-validity (exact 0%, mean diff 1.00), planner actionability and consistency (mean diff 1.00), verifier grounding (mean diff 1.00).

Against the proposed default (at least 80 percent of calibration claims: met, 100 percent; at least 80 percent within one point per criterion): verifier grounding, cards grounding, cards claim-precision, cards fidelity, planner actionability and planner consistency fall short (2 of 3 within one point).

## Judge reasons, quoted (short; model output about public eShop code or invented text)

- verifier, `verifier-skip-formula`: "The verdict is Rejected, but the hand label is Supported" (verdict-correct 1); the judge also saw that the reason "contradicts the verdict" (reason-quality 1).
- reader, `reader-edit-invented`: "assert price validation and a confirmation email, and lines 18-35 show neither" (grounding 1).
- cards, `cards-write-badformat`: "The JSON parses, but the citation ... is malformed" (format-validity 2). On `cards-write-good` it scored grounding 3 because "hi-lo index generator" is "not shown" in the source, where the hand score is 5.
- planner, `planner-data-vague`: "generic advice that would fit any system" (actionability 1).
- summariser, `summariser-markdown`: "contains Markdown bold and a Markdown link, which the form forbids" (form 3).
- shared, `shared-secret-leaked`: "It invents a probable password value" (grounding 1).

## Two judged runs (real calls, Haiku 5.5 as the target, Opus 5.5 as the judge)

| Run id                | Prompt                                   | Cases | Valid first try | Agreement with labels | Judge mean overall | Judge criteria means                                             | Target cost | Judge cost |
| --------------------- | ---------------------------------------- | ----- | --------------- | --------------------- | ------------------ | ---------------------------------------------------------------- | ----------- | ---------- |
| `20261113-164046-lab` | verifier/claim.v5, verifier-claim-sample | 4     | 100%            | 100%                  | 5.0 (4 scored)     | grounding 5.0, verdict-correct 5.0, reason-quality 5.0, form 5.0 | $0.0007     | $0.0326    |
| `20261113-164102-lab` | summariser/overview.v1, overview-sample  | 2     | 100%            | n/a (no labels)       | 4.5 (2 scored)     | grounding 4.5, citation-accuracy 5.0, coverage 4.5, form 4.0     | $0.0009     | $0.0193    |

No case was vetoed, refused or errored; no RST code. The two runs cost $0.0535 in all. Ledger for this card: $2.1247 (rejected key) + $0.3633 (judge check) + $0.0535 = **$2.5415 of the $3 slice**. Four and two cases are too few to say anything about the prompts; they show the judge works inside a run.

## Smoke run on a local model (history, 2026-11-13)

Before a valid key existed, the chain was checked on the local model `gemma4:e4b` (priced at zero). It showed that the judged run, `--compare` with judge means, and `--judge-check ... --limit 1` work end to end; it is not a calibration (a 7.5B judge says nothing about how far Opus agrees with a person). Its figures (a judged run of 4 cases with mean overall 4.5, and one judge-check item per family) **predate the verdict-correct veto** (a wrong verdict now forces the overall to 1), so they would read differently today. Two gaps it found were fixed: the hold lifetime check refused Ollama providers with the template's settings, and a judge check could not be limited (`--limit n`).

## The 18 hand-scored samples

The 18 samples of `eval/judge-check/hand-scored.json` (three per family; sources are public eShopModernizing excerpts under the MIT licence or invented text; the answers and the scores were written by the builder, so please read them critically). The overall score is the mean of the criteria, or 1 when a veto criterion scored 1.

| Family     | Sample                  | Hand scores                                                        | Hand overall | Judge overall |
| ---------- | ----------------------- | ------------------------------------------------------------------ | ------------ | ------------- |
| verifier   | verifier-find-item      | grounding 5, verdict-correct 5, reason-quality 5, form 5           | 5.0          | 5.0           |
| verifier   | verifier-sorted-by-name | grounding 1, verdict-correct 1, reason-quality 1, form 5           | 1.0          | 1.0           |
| verifier   | verifier-skip-formula   | grounding 5, verdict-correct 1, reason-quality 1, form 5           | 1.0          | 1.0           |
| reader     | reader-edit-good        | grounding 5, evidence-quality 5, coverage 4, card-form 5           | 4.8          | 4.5           |
| reader     | reader-edit-invented    | grounding 1, evidence-quality 2, coverage 2, card-form 4           | 2.3          | 2.0           |
| reader     | reader-edit-bundled     | grounding 4, evidence-quality 3, coverage 3, card-form 3           | 3.3          | 3.0           |
| cards      | cards-write-good        | grounding 5, format-validity 5, claim-precision 5, fidelity 5      | 5.0          | 3.3           |
| cards      | cards-write-badformat   | grounding 4, format-validity 1, claim-precision 4, fidelity 3      | 3.0          | 2.5           |
| cards      | cards-write-vague       | grounding 1, format-validity 5, claim-precision 1, fidelity 3      | 2.5          | 2.0           |
| planner    | planner-data-good       | grounding 5, completeness 4, actionability 4, consistency 5        | 4.5          | 3.8           |
| planner    | planner-data-invented   | grounding 1, completeness 2, actionability 4, consistency 2        | 2.3          | 2.0           |
| planner    | planner-data-vague      | grounding 2, completeness 1, actionability 1, consistency 4        | 2.0          | 1.3           |
| summariser | summariser-good         | grounding 5, citation-accuracy 5, coverage 4, form 5               | 4.8          | 4.8           |
| summariser | summariser-invented     | grounding 1, citation-accuracy 1, coverage 2, form 5               | 2.3          | 1.8           |
| summariser | summariser-markdown     | grounding 4, citation-accuracy 4, coverage 3, form 2               | 3.3          | 3.5           |
| shared     | shared-secret-found     | grounding 5, secret-detection 5, secret-handling 5, no-overreach 5 | 5.0          | 5.0           |
| shared     | shared-secret-missed    | grounding 3, secret-detection 1, secret-handling 2, no-overreach 5 | 1.0          | 1.0           |
| shared     | shared-secret-leaked    | grounding 1, secret-detection 2, secret-handling 1, no-overreach 2 | 1.5          | 1.3           |

## How far to trust the judge

On this sample the judge is good enough to rule prompt versions in or out for the **verifier** (3 of 3 overall in band, every criterion but grounding exact; calibration 12 of 12) and for **shared** (3 of 3, all criteria within one point). Use it with care for the **reader** and the **summariser** (2 of 3 in band, all criteria within one point, but exact agreement is low on card-form, form and coverage): read the per-case scores and not only the mean. It should not decide on its own for **cards** and **planner** (1 of 3 in band; mean differences of 1.0 or more on fidelity, format-validity, actionability and consistency): there the deterministic metrics (valid first try, format, citation checks) decide and the judge is advisory until the owner has reviewed this sample. Three samples per family is a small base, and part of any disagreement may be the builder's hand score being wrong, not the judge.

## For the owner

- Read the 18 samples in `eval/judge-check/hand-scored.json` and the judge's per-criterion reasons in the check report, and decide for each family whose score you would accept.
- Challenge first the hand scores where the judge differs most: `cards-write-good` (hand 5.0, judge 3.3: is "hi-lo index generator" supported by the source, and is one card for update and remove acceptable?), `planner-data-good` (hand 4.5, judge 3.8), `cards-write-badformat` and `cards-write-vague` (format-validity and fidelity), `planner-data-invented` (hand 2.3, judge 2.0), `summariser-invented` (hand 2.3, judge 1.8) and `reader-edit-bundled` (card-form).
- Check the verifier grounding gap (mean diff 1.0): the judge asks that the reason name the lines that settle the claim; is that what you want?
- Say whether the proposed default (80 percent of calibration claims and 80 percent within one point per criterion) stands, and whether a family below it may use the judge as advisory only.
