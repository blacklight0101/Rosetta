# Judge sample for the owner (P10-03)

Status 2026-11-13: **the judge has not scored anything yet.** The judge (`--judge`) and the judge check (`--judge-check`) are built and tested with the fake provider (RF-1407, RF-1408), but the first real run, `npm run lab -- --judge-check anthropic:claude-opus-5-5 --yes`, was refused by Anthropic with RST-1518 (the key was rejected) on every call, so no real judge score exists. The ledger booked the failed calls at their worst case: **$2.1247** of the card slice of $3 (31 calls, none answered; a rejected key is probably not billed by Anthropic, but the ledger cannot tell). The rest of the slice ($0.8753) is kept, because every further run would fail the same way until the key in the file given to `--env-file` is valid. No judge agreement figure is reported below because there is none.

## Smoke run on a local model, not the calibration (2026-11-13)

Both cloud keys were rejected (Anthropic 401, OpenAI 401), so the chain was checked on the local Ollama model `gemma4:e4b` (priced at zero; `tev1` was tried first and cannot be used, because Ollama reports only the capability `decision` for it and answers every chat with HTTP 400). This shows that the chain works. **It is not the judge calibration**: a 7.5B local judge says nothing about how far Opus agrees with a person.

- Judged run, `verifier/claim.v5` on `verifier-claim-sample` (4 cases), target and judge both `ollama:gemma4:e4b`: 4 of 4 valid on the first try, agreement with the labels 75%, 1445 input and 39 output tokens and 34 s per call, cost $0.0000. Judge: 4 scored, mean overall 4.5 (grounding 4.5, verdict-correct 4.0, reason-quality 4.5, form 5.0), per case 5.0, 4.8, 3.3, 5.0; the 3.3 is the case where the answer disagrees with its label.
- `--compare` of that run with itself: totals, per-case marks and `judge n.n` per case printed; nothing sent.
- `--judge-check ollama:gemma4:e4b --limit 1 --yes` (7 judge calls, 28 s): all 7 scored; judge overall per sample verifier 4.0 and 5.0, reader 3.5, cards 2.3, planner 4.0, summariser 5.0, shared 5.0; overall in the same band as the hand score for 4 of 6 families; the one calibration claim shown with the label's verdict was scored below 4 on `verdict-correct` (disagreement). One item per family is too few for any agreement figure.
- Ledger: every Ollama call was held and settled at $0 in the shared ledger; the total of the card stays $2.1247 (the failed Anthropic calls).
- Two gaps found and fixed: the hold lifetime check refused any Ollama provider with the template's settings (120 s, 3 retries is 40 minutes), and a judge check could not be limited (`--limit n`).

## To finish this card

1. Put a valid `ANTHROPIC_API_KEY` in the environment file the lab is started with.
2. Run the judge check (30 judge calls, about $0.5 with Opus 5.5 at the shipped price): `ROSETTA_LAB_LEDGER=<shared ledger> node --env-file=<env file> --import ./scripts/register-ts.mjs scripts/lab.mjs --judge-check anthropic:claude-opus-5-5 --yes`.
3. Run one judged run per wired prompt, for example `--prompt verifier/claim --version v5 --model anthropic:claude-haiku-5-5 --cases verifier-claim-sample --judge anthropic:claude-opus-5-5 --yes` and the same for `summariser/overview` with `overview-sample`.
4. Fill the last column below from `lab-out/<id>/judge-check.json` (items[].overall) and the agreement lines the command prints, and add a few short quotes of the judge reasons per family.

## What the owner can already review: the hand scores

The 18 samples of `eval/judge-check/hand-scored.json` (three per family; sources are public eShopModernizing excerpts under the MIT licence or invented text; the answers and the scores were written by the builder, so please read them critically). The overall score is the mean of the criteria, or 1 when a veto criterion scored 1.

| Family     | Sample                  | Hand scores                                                        | Hand overall | Judge overall |
| ---------- | ----------------------- | ------------------------------------------------------------------ | ------------ | ------------- |
| verifier   | verifier-find-item      | grounding 5, verdict-correct 5, reason-quality 5, form 5           | 5.0          | not run       |
| verifier   | verifier-sorted-by-name | grounding 1, verdict-correct 1, reason-quality 1, form 5           | 1.0          | not run       |
| verifier   | verifier-skip-formula   | grounding 5, verdict-correct 1, reason-quality 1, form 5           | 1.0          | not run       |
| reader     | reader-edit-good        | grounding 5, evidence-quality 5, coverage 4, card-form 5           | 4.8          | not run       |
| reader     | reader-edit-invented    | grounding 1, evidence-quality 2, coverage 2, card-form 4           | 2.3          | not run       |
| reader     | reader-edit-bundled     | grounding 4, evidence-quality 3, coverage 3, card-form 3           | 3.3          | not run       |
| cards      | cards-write-good        | grounding 5, format-validity 5, claim-precision 5, fidelity 5      | 5.0          | not run       |
| cards      | cards-write-badformat   | grounding 4, format-validity 1, claim-precision 4, fidelity 3      | 3.0          | not run       |
| cards      | cards-write-vague       | grounding 1, format-validity 5, claim-precision 1, fidelity 3      | 2.5          | not run       |
| planner    | planner-data-good       | grounding 5, completeness 4, actionability 4, consistency 5        | 4.5          | not run       |
| planner    | planner-data-invented   | grounding 1, completeness 2, actionability 4, consistency 2        | 2.3          | not run       |
| planner    | planner-data-vague      | grounding 2, completeness 1, actionability 1, consistency 4        | 2.0          | not run       |
| summariser | summariser-good         | grounding 5, citation-accuracy 5, coverage 4, form 5               | 4.8          | not run       |
| summariser | summariser-invented     | grounding 1, citation-accuracy 1, coverage 2, form 5               | 2.3          | not run       |
| summariser | summariser-markdown     | grounding 4, citation-accuracy 4, coverage 3, form 2               | 3.3          | not run       |
| shared     | shared-secret-found     | grounding 5, secret-detection 5, secret-handling 5, no-overreach 5 | 5.0          | not run       |
| shared     | shared-secret-missed    | grounding 3, secret-detection 1, secret-handling 2, no-overreach 5 | 1.0          | not run       |
| shared     | shared-secret-leaked    | grounding 1, secret-detection 2, secret-handling 1, no-overreach 2 | 1.5          | not run       |

## How the judge will be reported

- Calibration claims: of 12 claims shown with the verdict of the label or its opposite, how many the judge scored 4 or 5 on `verdict-correct` exactly when the verdict follows the hand label.
- Hand-scored samples, per family and criterion: exact agreement, within one point, mean absolute difference, and whether the overall scores fall in the same band (4 and up, 2 and down, otherwise middle).
- Owner decision: a judge score may rule a prompt version in or out only where these agreements are good enough; the default proposed is at least 80 percent of calibration claims and at least 80 percent within one point per criterion.
