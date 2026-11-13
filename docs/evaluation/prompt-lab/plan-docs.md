# Round log: the plan document prompts (P10-08)

Status 2026-11-13: **in progress, no version kept.** Haiku 5.5 ran every round; the judge (Opus 5.5) is advisory for the planner and scored a few cases per round (noise of 0.3 or more). Keep rule: DEC-231, then DEC-235 (a planner version needs a deterministic gain on the held-back cases; a judge gain alone does not count; input tokens, output tokens, latency and cost each rise by at most 15%). Spend of this card: about $4.6 of $6. Run ids are folders of `lab-out/`, prefix `20261113-`.

## What was found before any tuning

1. **No new run was needed.** The saved eShopModernizing plan runs held more plan inputs than the first capture read: the Ollama runs, the failed and `-try1` runs and the two `p6-haiku-eshop-v2-plan` runs (inputs only, no model answer read). The plan document sets were re-captured from them with the documented capture command. Cases and held-back: prd 7/3, package 7/3, plan-repair 4/2 (same base inputs as package, problem lines kept), api-contract 11/2, ux 7/1, data-model 8/2, flows 13/6, coverage 10/4. No set is one-sided now (`ONE_SIDED` is empty).
2. **The cards of a PRD or plan case were all rules.** The capture kept the first eight cards, and in every saved run they are `BR` cards, so no PRD or plan case held a feature, an entity, a flow or a screen; the judge's "roles, features, outOfScope empty" was the right answer to such a case. The capture now takes the eight cards in turns over the card types (test `plan-doc-spread.test.ts`).
3. **The api-contract set could not test the contract.** All six captured cases name a server-rendered front end (Razor Pages), so declining (`applies: false`, about 115 output tokens) is the correct answer under the prompt; the judge's 1.8 to 3.8 there is an artefact (it scores the missing contract). Five hand-made `-spa` variants, each on the side of its base case (a React single-page application over a Web API, invented choices) were added so the planner is asked for operations.
4. **The data-model case `eshop-20261023-152751-plan-planner-data-model` is a valid "no table" answer.** Its nine entity cards describe containers, connection strings, a Kubernetes manifest and application parameters; no field or column. The prompt tells the planner that a card with no stored data gets no table, the planner answered `tables: []` with a reason for each dropped claim (the judge scored it 4.3 and 4.8), and the parser refused it (`tables` needed one item). In a run that answer was asked again as two halves and then replaced by tables copied from the claims, marked "the planner's answer failed". Now (RF-623, spec commit, then red plan-run test, then fix): the answer is accepted and not asked again; the run still writes one table per card, because RF-623 keeps the model from being empty, but each says the planner found no stored data in the card, with its own reason, and no text in `data-model.md`, `checks.md` or the warnings says an answer failed. A bare `{"tables": []}` stays no answer. The parser change itself went in with its test in one commit (22f42699), not red first; the run behaviour had a red `test:` commit.

## Baselines (Haiku, `--split tune`, current versions)

First-try valid 100%, repaired 0, unusable 0, no refusal, no RST code, on every set. The deterministic checks of the lab are at their ceiling for all seven prompts, so a planner version can only be kept under DEC-235 on a deterministic gain that these checks cannot show. Every figure below that separates versions is the judge's or a cost.

| Prompt (run)             | Cases | Judge mean | Output tokens | Latency |
| ------------------------ | ----- | ---------- | ------------- | ------- |
| data-model.v5 (212255)   | 6     | 3.6        | 2298          | 9.5 s   |
| ux.v1 (212356)           | 6     | 3.73       | 1234          | 5.8 s   |
| flows.v2 (212513)        | 7     | 3.51       | 1494          | 6.2 s   |
| coverage.v2 (212559)     | 6     | 3.98       | 845           | 3.8 s   |
| prd.v4, new set (214007) | 4     | 3.4        | 1098          | 5.1 s   |
| api-contract.v1 (214140) | 4     | 2.97       | 1070          | 4.6 s   |
| package.v12 (214533)     | 3     | not judged | 6632          | 26.7 s  |

Weak criteria the judge named: flows and coverage completeness (steps and items left out), data-model completeness (missing tables, key generation), ux and prd actionability.

## Rounds (tune sample of 3 unless stated, against the baseline on the same cases)

| Prompt       | Round | Change (one thing, cumulative)                                                           | Run    | Judge (base)                 | Out tokens                    | Decision               |
| ------------ | ----- | ---------------------------------------------------------------------------------------- | ------ | ---------------------------- | ----------------------------- | ---------------------- |
| flows        | 1     | v3: place every step on the closest component; an in-scope journey with no step is wrong | 212909 | 3.8 (3.6)                    | 1245                          | go on                  |
| flows        | 2     | v4: a duplicate only when another card shows the same steps; name the kept card          | 213259 | 3.7 (3.6)                    | 1155                          | go on                  |
| flows        | 3     | v5: the action keeps the condition and outcome the claim names                           | 213815 | 3.87 (3.6), completeness 4.7 | 1504                          | candidate              |
| ux           | 1     | v2: purpose names route and required fields (two sentences)                              | 212945 | 3.87 (3.77)                  | 1487                          | go on                  |
| ux           | 2     | v3: merge reason names roles only when the cards give roles                              | 213341 | 3.93 (3.77)                  | 1588                          | candidate              |
| ux           | 3     | v4: purpose also names the actions                                                       | 213853 | 3.6 (3.77)                   | 1602                          | worse, drop            |
| coverage     | 1     | v3: link every feature, table, operation, journey, screen the card does                  | 213015 | 3.67 (4.03)                  | 1055                          | worse, drop            |
| coverage     | 2     | v3b: go through the items one kind at a time                                             | 213412 | 4.0 (4.03)                   | 895                           | flat                   |
| coverage     | 3     | v3c: an empty `builds` only after checking the area                                      | 213921 | 4.33 (4.03)                  | 754                           | candidate              |
| data-model   | 1     | v6: say how a key is made and which size was chosen, in `risk` (all 6 tune)              | 213925 | 3.75 (3.6)                   | 2541 (+11%)                   | go on                  |
| data-model   | 2     | v6b: check that every entity card has a table or is a gap                                | 214152 | 4.27 (4.1)                   | 3114 (same)                   | candidate              |
| data-model   | 3     | v6c: short purpose, no repeated risk                                                     | 214254 | 4.03 (4.1)                   | 3692                          | worse, drop            |
| prd          | 1     | v5: keep figures, limits and conditions inside the sentence (2 cases)                    | 214133 | 3.15 (3.4)                   | 2229 (+85%)                   | worse                  |
| prd          | 2     | v5b: answered questions become rules, scope lines or expectations                        | 214206 | 3.15 (3.4)                   | 2139                          | worse                  |
| prd          | 3     | v5c: a FLOW or SCRN card is cited by its feature                                         | 214232 | 3.15 (3.4)                   | 1371                          | worse; ceiling         |
| api-contract | 1     | v2: a single-page or desktop client makes the contract apply (4 cases, 2 variants)       | 214224 | 2.85 (2.97)                  | 1220                          | flat                   |
| api-contract | 2     | v2b: say what the operation returns in the summary                                       | 214305 | 2.8 (2.97)                   | 1094                          | flat                   |
| api-contract | 3     | v2c: cover every feature and flow card or list it in `notServed`                         | 214348 | 3.15 (2.97)                  | 1136                          | candidate, not decided |
| package      | 1     | v13: every requirement is built by at least one task (unjudged, 3 cases)                 | 214642 | not judged                   | 5427 (6632; 21.9 s vs 26.7 s) | unjudged               |
| package      | 2     | v13b: phases name parts, never "the remaining parts"                                     | 214813 | not judged                   | 7147 (29.2 s)                 | unjudged               |
| package      | 3     | v13c: one entity entry per ENT card                                                      | 214946 | not judged                   | 7377 (30.4 s)                 | unjudged               |

The drafts are the current files with the sentence of the "Change" column added; each round is the previous one plus one sentence. No draft is committed, because none was kept. Package rounds were unjudged to stay inside the slice (a package call costs $0.03, its judge $0.05); all three were valid first try and the run with the lowest output (v13) is not a gain on its own.

Notes on the figures. Runs 212255 (data-model) and 212356 (ux) were made on case-set files whose bytes differ from the committed ones only by formatting (the capture writes unformatted JSON and the files were formatted just before); the cases are the same, but `--compare` would refuse them, so the tables above compare judge means and tokens by hand over the same case ids. The first prd and package runs (212203, 212449, 212713, 213103) used the set from before the card rotation (every card a rule); the prd and package figures of the rounds use the rotated set and a new baseline (214007, 214533). In the lab a data-model answer with no table is usable only when it has a readable reason for a dropped claim and no refused table; the run reads it the same way.

## Held-back decisions (Haiku, every held-back case, judged)

| Prompt                                | Cases | Judge, current to draft               | Output tokens       | Input tokens       | Latency (1 repetition) | Decision                                                                                                                                                                                |
| ------------------------------------- | ----- | ------------------------------------- | ------------------- | ------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| flows v2 to v5 (214050, 214202)       | 6     | 3.6 to 3.85 (completeness 3.5 to 4.2) | 1857 to 1756        | 4768 to 4913 (+3%) | 7.2 to 6.7 s           | **not kept** (DEC-235): the +3% input tokens is within the 15% allowance, but there is no deterministic gain (valid 100% on both) and a judge gain alone does not count for the planner |
| ux v1 to v3 (214218, 214231)          | 1     | 3.8 to 3.5                            | 1057 to 1287 (+22%) |                    |                        | not kept                                                                                                                                                                                |
| coverage v2 to v3c (214301, 214331)   | 4     | 4.17 to 4.25                          | 630 to 691 (+10%)   | 4657 to 4734       | 3.2 to 3.3 s           | not kept: no deterministic gain                                                                                                                                                         |
| data-model v5 to v6b (214425, 214450) | 2     | 3.8 to 3.55                           | 1530 to 1540        |                    |                        | not kept                                                                                                                                                                                |

prd and api-contract had no draft that beat its baseline on the tune cases (api-contract v2c is the only judge gain, +0.2 on 4 cases, which the declined-case artefact makes untrustworthy), so no held-back run was made. Package has no judged held-back run.

Sonnet and Opus (held-back sample 2 of flows v5, 214551 and 214611): 100% valid on both, 1227 and 1186 output tokens, 7.6 and 8.9 s. Shown for completeness; the version was not kept.

## Verdict and what is left

- **Ceiling of the lab's own checks.** First-try validity is 100% and unusable 0 for all seven prompts on every tune and held-back case run (Haiku, Sonnet, Opus), so the deterministic checks cannot separate versions. The two real defects found were not in the prompts: the empty data model (parser, fixed) and the sets (capture and variants, fixed).
- **Candidates for the owner.** flows v5 (judge +0.25 on 6 held-back cases, completeness +0.7, fewer output tokens) and coverage v3c are the best drafts. To keep them under DEC-235 the lab needs a deterministic completeness check (the share of the claims of an in-scope flow that get a step; the share of items some task builds); that is the next step of P10-08.
- **Left:** `planner/workbook` (local set only), `planner/adr-model` (no set), `planner/options` and `planner/continue` (not wired); judged package and api-contract held-back runs; latency with `--repetitions 2` on a candidate.
