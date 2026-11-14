# Prompt lab: the verifier and summariser prompts (P10-06)

Card P10-06, 2026-11-14. Requirements RF-1411 and RF-1412; rule of keeping DEC-231 as relaxed by DEC-235, matched runs per DEC-237, deterministic measures per DEC-238. All runs: Haiku 5.5 for tuning, Sonnet 5.5 and Opus 5.5 for the matched check of the one version kept; judge Opus 5.5 on one repetition. Spend: **$1.00** of the $3.00 slice (target calls $0.5457, judge $0.4470); the shared ledger went from $23.48 to $24.49.

**Result: one version kept, `verifier/claim.v6`. Nothing kept for `summariser/merge`, `summariser/overview` or `verifier/retry`.**

## Sets and sides

| Set                          | Cases | Tune | Held-back | Notes                                                                                                                                              |
| ---------------------------- | ----- | ---- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifier-claim-calibration` | 30    | 20   | 10        | New. The 30 claims of `eval/calibration/webforms-shop.json` over the synthetic fixture; 15 `Supported` and 15 `Rejected`; held-back holds 5 and 5. |
| `verifier-claim-sample`      | 4     | 3    | 1         | Invented. Not used: the calibration set contains what it measures. One held-back case is too few to keep anything.                                 |
| `summariser-merge`           | 10    | 7    | 3         | Captured from eShopModernizing runs, no labels.                                                                                                    |
| `summariser-overview`        | 3     | 1    | 2         | Captured. One tune case only, so tune rounds use five repetitions.                                                                                 |
| `overview-sample`            | 2     | 2    | 0         | Invented, no side marked: measured nowhere, nothing could be kept from it (DEC-234).                                                               |

The calibration split is the fixed rule of RF-1405 on the input (`lab/cases/verifier-claim-calibration.json`); a test recomputes it, checks every claim, citation and label against `eval/calibration/webforms-shop.json`, and checks that the cited files are the fixture's byte for byte.

## Measures, and the cheapest wrong answers each one stops

1. **Label agreement** per case (the existing `expected` comparison), now with `Disagreements (expected -> got)` in the summary and `--compare` (RF-1411, `lab-disagreements.ts`). It reports false "supported" (`Rejected -> Supported`), false "not supported" (`Supported -> Rejected`) and `-> Unverified` apart. It adds no per-label count: the generic `Labels:` line of RF-1410 is unchanged and #1411's counts can be merged beside it.
   - Everything `Supported`: agreement 50%, `Rejected -> Supported x15`.
   - Everything `Rejected`: agreement 50%, `Supported -> Rejected x15`.
   - No verdict (`I cannot tell.`): agreement 0%, every case `-> Unverified`, none usable.
   - Only an answer that follows the hand label reaches 100% with no disagreement. A test runs each of these over the real 30 cases through the real target (`lab-targets-verifier-calibration.test.ts`).
   - Two versions with the same agreement but different kinds of error show different pairs (`lab-disagreements.test.ts`).
2. **Merge labels** (RF-1412, `merge-check.ts`): `Invalid` (fewer than two ids, an unlisted id, an id twice), `Lumped` (a merge of more than half of a case of four cards or more), `Thin` (the merged title and summary share no word of four letters with the title of one of its cards), `Merges`, `NoMerge`. Wrong answers tried: one merge of every card, a merge of one id, of an unlisted id, a merge whose text names one card only, text `Nothing to merge.`: each is not usable (`lab-targets-summariser.test.ts`, `merge-check.test.ts`). The merged card keeps every claim and citation by the run's own code, so the check guards what the answer can still lose: the ids, the lump and the text.
3. **Overview labels** (RF-1412, `overview-check.ts`): `Empty` (no statement with text and a listed card, the run's `sectionsOf` rule), `Lumped` (one statement links every card), `Missed` (an area with no card linked, or a FEAT, SCRN, ENT or INT card whose section holds no statement linking a card of that type), `Written`. Wrong answers tried: all sections empty, a statement of only unlisted ids, one statement for every card, an overview with an area or a section left out: each is not usable.
4. The judge (Opus 5.5; trusted for the verifier family, "in the middle" for the summariser, `judge-sample.md`).

**What the measures cannot do.** `NoMerge` is a valid answer and is not punished by a label, because a case may hold no duplicate; a prompt that always answers `{"merges": []}` would pass the checks. The keep rule therefore requires the `Merges` count not to fall (RF-1412). The merge cases have no hand labels, so how many duplicates exist is not known; a label set written by hand is the open item.

## Verifier: rounds on the tune side (Haiku 5.5, three repetitions, 60 calls each)

The current version v5 already agrees with all 20 tune labels, so the tune side cannot show a gain in agreement; the rounds aim at the failures the held-back baseline showed (10% of answers needed the retry, because the reason ran over 300 characters, and `Supported -> Rejected x3`, claims whose purpose the names show but a comment does not state). Candidates were chosen on the tune side only; the held-back side was run once for v5 and once for the one candidate picked by the rule below.

| Round | Change                                                                                                                                                            | Agreement | False supported / false not supported | First try valid | Input / output tokens | Cost / 60 calls | Run id              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------- | --------------- | --------------------- | --------------- | ------------------- |
| base  | v5                                                                                                                                                                | 100%      | 0 / 0                                 | 95%             | 2085.6 / 94.8         | $0.0078         | 20261114-063826-lab |
| 1     | v5 plus "reason at most 200 characters (refused above 300), name the lines, do not quote code"                                                                    | 100%      | 0 / 0                                 | 100%            | 2097.3 / 96.2         | $0.0076         | 20261114-064042-lab |
| 2     | round 1 plus "read the claim as a developer would: when the names in the lines show what a value is for, `Supported`; do not reject for a detail the lines imply" | 100%      | 0 / 0                                 | 100%            | 2181.8 / 81.3         | $0.0072         | 20261114-064145-lab |
| 3     | round 2 with the reason cut to 150 characters                                                                                                                     | 100%      | 0 / 0                                 | 100%            | 2182.1 / 81.1         | $0.0072         | 20261114-064257-lab |

Rule written before the held-back run: among the candidates that tie on tune agreement and validity, take the lowest cost per call. Rounds 2 and 3 tie at $0.0072; round 3 has the lower latency (936 ms against 996 ms), so round 3 became `claim.v6`. The repair in v5 is the retry the run already does; v6 needs it less.

## Verifier: the keep decision (held-back, 10 cases, matched per model, never pooled)

| Model         | Version | Reps | Agreement | False supported | False not supported | First try valid | Repaired | Input / output tokens | Latency | Cost / run | Run id              |
| ------------- | ------- | ---- | --------- | --------------- | ------------------- | --------------- | -------- | --------------------- | ------- | ---------- | ------------------- |
| Haiku 5.5     | v5      | 3    | 90%       | 0               | 3                   | 90%             | 10%      | 2060.8 / 120.9        | 1169 ms | $0.0043    | 20261114-063911-lab |
| Haiku 5.5     | v6      | 3    | 90%       | 0               | 3                   | 100%            | 0%       | 2148.9 / 76.6         | 897 ms  | $0.0033    | 20261114-064332-lab |
| Sonnet 5.5    | v5      | 3    | 97%       | 0               | 1                   | 90%             | 10%      | 2070.1 / 86.9         | 1782 ms | $0.0728    | 20261114-064626-lab |
| Sonnet 5.5    | v6      | 3    | 100%      | 0               | 0                   | 97%             | 3%       | 2160.7 / 72.0         | 1762 ms | $0.0651    | 20261114-064724-lab |
| Opus 5.5      | v5      | 3    | 100%      | 0               | 0                   | 100%            | 0%       | 2036.3 / 100.0        | 2013 ms | $0.1420    | 20261114-064828-lab |
| Opus 5.5      | v6      | 3    | 100%      | 0               | 0                   | 100%            | 0%       | 2147.6 / 70.7         | 1871 ms | $0.1257    | 20261114-064927-lab |
| Haiku, judged | v5      | 1    | 90%       | 0               | 1                   | 100%            | 0%       | 2037.7 / 128.2        | 1192 ms | $0.0013    | 20261114-064437-lab |
| Haiku, judged | v6      | 1    | 90%       | 0               | 1                   | 100%            | 0%       | 2150.2 / 94.8         | 1080 ms | $0.0012    | 20261114-064524-lab |

Judge (Opus 5.5, Haiku answers, one repetition, 10 cases): mean overall 4.4 for both (v5: grounding 4.3, verdict-correct 4.6, reason-quality 4.6, form 4.9; v6: 4.2, 4.6, 4.5, 4.9); one veto in each (the same false "not supported" case). Judge cost $0.1110 and $0.1034.

Against the rule:

- **Calibration agreement does not drop**: equal on Haiku and Opus, higher on Sonnet (97% to 100%). **False supported stays 0 on every model; false not supported never rises** (3, 3 on Haiku; 1 to 0 on Sonnet; 0, 0 on Opus).
- (a) no regression on first-try validity, repairs, refusals, errors, agreement or a veto: first-try validity rises on Haiku (90% to 100%) and Sonnet (90% to 97%), equal on Opus; no refusal, no RST code, same veto count. The judge's grounding and reason-quality means are 0.1 lower on one repetition of ten cases, the overall mean is equal; this is inside what ten cases can show and is stated, not hidden.
- (b) clear improvement: fewer repaired answers (Haiku 10% to 0%, Sonnet 10% to 3%), and Sonnet agreement up one case in 30.
- (c) cost and latency: input tokens +4.3% to +5.5% per call; output tokens -37% (Haiku), -17% (Sonnet), -29% (Opus); cost per run -23% (Haiku), -11% (Sonnet), -11% (Opus); latency -23%, -1%, -7%. No measure rises by more than the 15% of DEC-235 and cost and latency fall.

**Kept: `prompts/verifier/claim.v6.md`.** The three false "not supported" cases of Haiku are still wrong (cal-09 and cal-14 style claims whose purpose is shown only by a name); round 2's added sentence did not remove them, and the gain of v6 is the shorter reason and fewer retries, not a better verdict. The sample is small (10 cases, 30 calls per model); the claim is "no worse, cheaper, fewer repairs", not "more accurate".

## Summariser: rounds on the tune side (Haiku 5.5)

Baseline held-back (current versions, Haiku): merge v2, 3 cases x 3 repetitions: 100% first try, `Merges 6, NoMerge 3`, no `Invalid`, `Lumped` or `Thin` (20261114-065544-lab, $0.0061); overview v1, 2 cases x 5 repetitions: `Written 10`, no `Empty`, `Lumped` or `Missed` (20261114-065638-lab, $0.0105). **Both current prompts already pass every deterministic check on every case measured**, so the checks show no loss to repair; they stand as guards a future change must pass.

| Prompt   | Round | Change                                                                                                                                                            | First try valid | Labels               | Input / output tokens | Cost    | Run id              |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------- | --------------------- | ------- | ------------------- |
| merge    | base  | v2, 7 tune cases x 3                                                                                                                                              | 100%            | Merges 17, NoMerge 4 | 3645 / 733            | $0.0148 | 20261114-065105-lab |
| merge    | 1     | rule 3: the title and summary name the subject of each card, in the words of the titles                                                                           | 100%            | Merges 16, NoMerge 5 | 3681 / 740            | $0.0149 | 20261114-065221-lab |
| merge    | 2     | round 1 plus "compare once more before an empty list; never more than half the cards in a group"                                                                  | 100%            | Merges 17, NoMerge 4 | 3739 / 731            | $0.0149 | 20261114-065334-lab |
| merge    | 3     | v2 plus "start with the titles: cards whose titles name the same table, page, setting or class are the first candidates"                                          | 100%            | Merges 18, NoMerge 3 | 3677 / 717            | $0.0147 | 20261114-070534-lab |
| overview | base  | v1, 1 tune case x 5                                                                                                                                               | 100%            | Written 5            | 4102 / 1359           | $0.0055 | 20261114-065404-lab |
| overview | 1     | rules: a FEAT card belongs in `features`, SCRN in `screens`, ENT in `data`, INT in `integrations`; every area has a statement; never one statement for every card | 100%            | Written 5            | 4202 / 1432           | $0.0057 | 20261114-065435-lab |
| overview | 2     | round 1 plus "a statement lists only the cards it says something about"                                                                                           | 100%            | Written 5            | 4228 / 1401           | $0.0057 | 20261114-065507-lab |
| overview | 3     | v1 with "one sentence a statement, at most five statements in a section, join cards that say the same"                                                            | 100%            | Written 5            | 4126 / 1247           | $0.0053 | 20261114-070602-lab |

Merge rounds: round 1 gave fewer merges (16 against 17) at more tokens; round 2 equalled the baseline at more tokens; round 3 gave one more merge (18 against 17 in 21 calls, within the noise of three repetitions) at -2% output tokens. Overview rounds: rounds 1 and 2 were all `Written 5` with +2.5% and +3.1% input and +5% and +3% output tokens; round 3 was `Written 5` with +0.6% input, -8% output, -4% cost.

The two round-3 candidates were the only ones that did not lose on the tune side, so each ran once on the held-back side (Haiku):

| Prompt   | Version | Reps | Labels              | Not usable | Input / output tokens | Cost    | Judge mean overall                                                  | Run id              |
| -------- | ------- | ---- | ------------------- | ---------- | --------------------- | ------- | ------------------------------------------------------------------- | ------------------- |
| merge    | v2      | 3    | Merges 6, NoMerge 3 | 0%         | 4102 / 566            | $0.0061 | not judged                                                          | 20261114-065544-lab |
| merge    | round 3 | 3    | Merges 6, NoMerge 3 | 0%         | 4133 / 537            | $0.0059 | not judged                                                          | 20261114-070639-lab |
| overview | v1      | 2    | Written 4           | 0%         | 3941 / 1302           | $0.0043 | 4.2 (grounding 4.0, citation 4.5, coverage 4.0, form 4.0), 4 scored | 20261114-070722-lab |
| overview | round 3 | 2    | Missed 1, Written 3 | **25%**    | 3958 / 1183           | $0.0039 | 4.4 (grounding 4.3, citation 4.5, coverage 4.0, form 4.5), 4 scored | 20261114-070802-lab |

(The baseline overview row of the earlier paragraph is five repetitions, `Written 10`, 20261114-065638-lab; the row above is the two-repetition judged run, matched with round 3.) The merge candidate equals the baseline on the labels and saves 3% of tokens: not a quality gain, not kept. The overview candidate **loses a case to `Missed`** (a section or an area left out; the shorter statements dropped one) while the judge scored it 0.2 higher: the deterministic measure caught a loss that the judge, with four cases, did not. It is not kept (DEC-235 forbids a regression on unusable answers). **Nothing is kept for either summariser prompt**: v2 and v1 stay.

The judge ran on the overview held-back pair only (the table above), and is only "in the middle" for this family.

## `verifier/retry`

Not wired. The retry prompt is the second ask `judgeClaim` makes after an unreadable first answer, and the verifier target takes it as a fixed input. Wiring it means a second prompt to vary in the lab (a new argument and a case that forces an unreadable first answer), and v5 and v6 make the retry fire in 0 to 10% of Haiku answers, so its effect cannot be measured on this set at a price worth paying. v6 lowers the retry rate by itself.

## Count mismatches

- The held-back calibration side has 10 cases; the Haiku runs show 30 or 33 calls, the Sonnet runs 31 and 33, because the retry is a second call in the same case.
- The judged runs have 10 cases and one repetition, the matched runs 30 cases (10 x 3): the judged figures are a separate row, not pooled with the others.

## What is left

- Hand labels for the merge cases, so `NoMerge` can be told right from wrong. Sonnet and Opus were not run for the summariser: nothing was kept, so no matched check was needed.
- The three false "not supported" verdicts of Haiku on held-back (a claim whose purpose is shown only by a name); the prompt change tried did not remove them.
- The overview sets hold one tune case; more captured runs are needed before the overview prompt can be tuned.
