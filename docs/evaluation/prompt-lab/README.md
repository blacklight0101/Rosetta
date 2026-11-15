# Phase 10 report: the prompt lab (P10-12)

Card P10-12, 2026-11-15, for the owner's review. Phase 10 (DEC-231, opened 2026-11-13) tested every prompt Rosetta sends to a model in a lab, with a budget of $50 and a stop for the owner at $40, one cap for all builders (DEC-232). Haiku 5.5 was tuned deeply, Sonnet 5.5 less and Opus 5.5 least; Opus 5.5 is the judge. This page is the entry point to the folder: one section per prompt family, the spend, the judge sample, the owner questions and the proposed follow-ups. Every figure comes from the linked doc of its card or from the shared lab ledger.

**Two items wait for P10-13** (the read-more cap, #1414): its Asset Manager, Invoice Generator and eShopModernizing journeys on the `rosetta-p10` stack, and the cap they select under the owner's rule (DEC-242). Both are marked **pending P10-13 journeys** below and will be filled in when that card reports.

## Summary

**Kept: two prompt versions under the keep rule, one by the owner's ruling, and one code cap.**

- `reader/read-more.v3` (P10-05, owner ruling DEC-238): it reads 12% to 25% more new lines at the read-more turn on every model, with cost per call within +2%.
- `verifier/claim.v6` (P10-06): fewer retried answers (Haiku 10% to 0%, Sonnet 10% to 3% on held-back), cost per run -11% to -23%, agreement not lower on any model.
- `shared/masked-value` v2: kept by the owner's ruling (DEC-244), to be wired by P10-15 (not merged yet). In the lab it failed DEC-235 (c) on Haiku (output +23.1%, latency +25.6%, cost +18.7% per call) for secret-handling 2.5 to 4.8; the owner ruled that the gain outweighs the cost on a small, rare call.
- A cap of 350 lines that `read_file` serves per read-more ask, in code (P10-13, owner ruling DEC-239 "Add a line cap", RF-1414). It bounds the later calls that v3 made larger. 350 is the number merged; the final number follows the rule of DEC-242. Its journey check is **pending P10-13 journeys**.

**Not kept: every other candidate.** Most failed one condition of the keep rule (DEC-231, DEC-235, DEC-237):

- a rise of more than 15% in output tokens or latency (`planner/plan-repair` v3 on Sonnet; `shared/masked-value` v2 too, kept afterwards by the owner's ruling);
- a regression on one model (`cards/continue`, gap, gap repair and card repair candidates);
- no deterministic gain where the judge is only advisory (plan document prompts at 100% valid first try).

Several "not kept" results came with a better measure. The lab now reads what a run does next with an answer (repair calls, gap rounds, lost cards, lines read). Those measures caught two versions that an earlier measure had kept: `cards/continue.v2` dropped cards, and `plan-repair.v3` raised Sonnet's output.

**End to end (P10-11, #1413).** On the new `rosetta-p10` stack the three comparable journeys cost $2.35 against $2.65 on 2026-11-09 (-11%), with about the same coverage. EV-100 and EV-108 are fixed. Two results went the wrong way: the eShop plan keeps less behaviour in its task cards (P10-D6, major), and `read-more.v3` was over +15% per call on Asset Manager, which led to DEC-239 and P10-13.

**Spend.** The shared lab ledger holds **$26.1283** settled. The `rosetta-p10` stack spent **$2.523** more (P10-11). Phase 10 so far: **$28.65 of $50**, $11.35 under the $40 stop line. The P10-13 journeys are not yet in it (their slice is $4.50, DEC-241). Details in [Spend](#spend).

**The owner answered** on 2026-11-15 ([Owner questions left](#owner-questions-left)): the cap is chosen by a rule from the P10-13 journeys (DEC-242); P10-D6 is the next card; Phase 10 is released to `main` after the P10-D6 fix; the $2.12 of the rejected key counts; the local sets are re-captured at the start of the next tuning round (DEC-243); the judge-sample default stands and `shared/masked-value` v2 is kept by ruling (DEC-244); behaviour kept by no task card is reported only, and a requirement that cites an out-of-scope journey stays listed as now (DEC-245). Left for the owner: the review of this report and the release after the P10-D6 fix. **Nothing of Phase 10 is released.**

## How to read this folder

| Doc                                              | Card   | What it holds                                                                       |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------------- |
| [judge-sample.md](judge-sample.md)               | P10-03 | the judge check and the 18 hand-scored samples for the owner                        |
| [baseline.md](baseline.md)                       | P10-04 | every prompt on three models before tuning, the ranking and the slices (DEC-234)    |
| [shared.md](shared.md)                           | P10-10 | `shared/masked-value`, `shared/text-tool-protocol`                                  |
| [plan-docs.md](plan-docs.md)                     | P10-08 | the plan document prompts                                                           |
| [cards.md](cards.md)                             | P10-09 | the card prompts                                                                    |
| [reader.md](reader.md)                           | P10-05 | the reader prompts and the keep of `read-more.v3`                                   |
| [plan-gap.md](plan-gap.md)                       | P10-07 | the plan gap and repair prompts, and `cards/repair`                                 |
| [verifier-summariser.md](verifier-summariser.md) | P10-06 | the verifier and summariser prompts and the keep of `claim.v6`                      |
| [end-to-end.md](end-to-end.md)                   | P10-11 | three apps end to end on `rosetta-p10` against 2026-11-09, defects P10-D1 to P10-D8 |
| [read-more-cap.md](read-more-cap.md)             | P10-13 | the 350-line cap per read-more ask, its arithmetic and lab rounds                   |

**The keep rule** used in every section: DEC-231 (no regression on any check), relaxed by DEC-235 (a clear quality gain may raise input tokens, output tokens, latency and cost per call by at most 15% each). DEC-237 says "no regression" holds on every model measured, on matched held-back runs only, never pooled. DEC-238 says a deterministic measure of what the prompt is for, defined in a requirement first, also counts as a quality gain. DEC-234 says no version is kept from a set with no held-back case.

## Prompt families

### Shared prompts (P10-10, #1401, #1406)

**Kept: `shared/masked-value` v2, by the owner's ruling (DEC-244), to be wired by P10-15 (not merged yet).** Under the keep rule nothing was kept: v2 fails DEC-235 (c), and the owner kept it as an exception. `shared/text-tool-protocol.v1` stays. `shared/secret-risk` has no model call.

**What changed in the lab.** The masked-value call is now the last turn, with no tools, so the answer is graded (RF-1406). Before, Haiku read more on 4 of 5 cases and the judge vetoed the empty answer.

| Prompt, model                    | Before (current)                                          | After (best candidate)                                    | Result                                                                                  |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| masked-value, Haiku (pooled)     | v1: judge 4.0, secret-handling 2.5, output 663.9, 3103 ms | v2: judge 4.6, secret-handling 4.8, output +23.1%, +25.6% | (c) fails; kept by the owner's ruling (DEC-244), to be wired by P10-15 (not merged yet) |
| masked-value, Sonnet (2 calls)   | v1: no `Leaked`, 100% agreement                           | v2 pre-fix: no `Leaked`, 100%, output +15.2%              | indicative only                                                                         |
| masked-value, Opus (2 calls)     | v1: no `Leaked`, 100% agreement                           | v2 pre-fix: no `Leaked`, 100%, output +11.6%              | indicative only                                                                         |
| text-tool-protocol, Haiku (tune) | v1: bare-JSON break 5 of 20 first turns                   | v2r3: 2 of 20                                             | candidate                                                                               |
| text-tool-protocol, Haiku (held) | v1: `ReadsFiles` 5 of 5                                   | v2r3: 3 of 5, input +3.0%                                 | not kept: regression                                                                    |

Sonnet and Opus were not run on the text-tool protocol, since nothing was kept. No `Leaked` outcome in any run.

**Spend:** about $1.5 of the $1.50 slice (targets $0.2, judge $1.3), plus $0.014 of the reserve. **Detail:** [shared.md](shared.md).

### Plan document prompts (P10-08, #1396, #1408)

**Kept: nothing.** `planner/prd`, `ux`, `data-model`, `api-contract`, `flows`, `coverage` and `package` stay.

**What changed instead.** The plan sets were re-captured with held-back cases for every prompt, and a PRD or plan case now holds cards of every type. Five `-spa` variants ask `api-contract` for operations. An empty data model with reasons is now a valid answer (RF-623).

| Prompt, model      | Before (current, held-back)                   | After (best draft, held-back)                  | Result                          |
| ------------------ | --------------------------------------------- | ---------------------------------------------- | ------------------------------- |
| flows, Haiku       | v2: valid 100%, judge 3.6, output 1857, 7.2 s | v5: valid 100%, judge 3.85, output 1756, 6.7 s | not kept: no deterministic gain |
| flows, Sonnet/Opus | not run on v2                                 | v5: 100% valid on a sample of 2 each           | shown for completeness          |
| coverage, Haiku    | v2: judge 4.17, output 630                    | v3c: judge 4.25, output 691 (+10%)             | not kept: no deterministic gain |
| ux, Haiku          | v1: judge 3.8                                 | v3: judge 3.5, output +22%                     | not kept                        |
| data-model, Haiku  | v5: judge 3.8                                 | v6b: judge 3.55                                | not kept                        |
| prd, api-contract  | no draft beat its tune baseline               | no held-back run                               | not kept                        |
| package            | v12: valid 100%, not judged                   | v13 to v13c: valid 100%, not judged            | unjudged                        |

**Keep rule applied:** the planner judge is advisory (`judge-sample.md`), so a planner version needs a deterministic gain. First-try validity is 100% for all seven prompts on every case and model run, so the lab's checks cannot separate versions. flows v5 and coverage v3c wait for a deterministic completeness check.

**Spend:** about $4.6 of the $6 slice. **Detail:** [plan-docs.md](plan-docs.md).

### Card prompts (P10-09, #1397, #1409)

**Kept: nothing.** `cards/continue.v1`, `flows.v1`, `screens.v2` and `card-format.v6` stay. `continue.v2` was kept in the first round, then reversed after the verifier found that it dropped cards in a real run and regressed on Sonnet.

**What changed in the lab.** `card-format`, `flows` and `screens` are graded on the final-answer turn with no tools. The `continue` cut is made from the case's first read. Two new labels: `Restarted` (a fresh answer instead of a continuation) and `Uncovered` (a file the case read is cited by no claim).

| Prompt, model                | Before (current, held-back, matched)      | After (best candidate s1)                         | Result                         |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------- | ------------------------------ |
| continue, Haiku (18 runs)    | v1: 3 valid, 15 not usable                | s1: 14 valid, 3 `Restarted`, 1 `Unusable`         | gain                           |
| continue, Sonnet (27 runs)   | v1: 25 usable, first try 26               | s1: 25 usable, first try 25, a leading line break | not kept: regression on Sonnet |
| flows, screens, Haiku (tune) | 8 of 8 and 7 of 7 valid                   | no round: at the ceiling                          | nothing to separate            |
| card-format, Haiku           | 18 of 20 valid (tune), 4 of 6 (held-back) | no round: the parser's problems are not recorded  | needs a lab change first       |

**Keep rule applied:** DEC-235 with DEC-237's strict reading. s1 would be the candidate once `joinFragment` strips a leading line break (a production change with its own RF).

**Spend:** $3.66 of the $4.50 slice. **Detail:** [cards.md](cards.md).

### Reader prompts (P10-05, #1395, #1410; cap P10-13, #1414)

**Kept: `reader/read-more.v3`** (DEC-238). Every other reader version stays: `task.v2`, `area.v12`, `read-first.v1`, `reread.v5`, `answers.v2`, `parent-cards.v2`, `turns-left.v2`, `workbook.v5`.

**What changed in the lab.** A reader turn that calls tools is graded by what its reads give the run's read gate (RF-1410): new lines read, share gain, stale and generated reads. The first version of this measure could not fail and was rewritten after verification.

`read-more` v2 against v3, matched held-back runs, 5 cases x 3:

| Model     | New lines per turn, v2 to v3 | Usable         | Output | Latency | Cost per call |
| --------- | ---------------------------- | -------------- | ------ | ------- | ------------- |
| Haiku (1) | 381.7 to 441.5 (+15.7%)      | 15/15 to 15/15 | +3.0%  | +7.6%   | +1.6%         |
| Haiku (2) | 376.8 to 469.9 (+24.7%)      | 15/15 to 15/15 | +0.5%  | +2.2%   | +0.7%         |
| Sonnet    | 254.4 to 288.1 (+13.2%)      | 15/15 to 15/15 | +6.5%  | +5.3%   | -3.0%         |
| Opus      | 226.2 to 253.7 (+12.2%)      | 15/15 to 15/15 | +4.8%  | -0.8%   | -3.4%         |

**The later cost a one-turn replay cannot see.** In real runs (P10-11), more lines read make every later call of the task larger. On Asset Manager the call after the reads was +25.5% against 2026-11-09, the task's last call +17%; on eShop +10% and +14%; on Invoice +2%. The owner ruled "Add a line cap" (DEC-239).

**The cap (P10-13).** `read_file` serves at most 350 lines per read-more ask, in code; the prompt stays v3. The arithmetic on the P10-11 Asset Manager task puts the call after the reads at +8.8% to +13.2%. In the lab the cap binds on Haiku, where v2 and v3 under it read the same new lines on held-back (299.8 and 300.9), so v3's lab gain goes on large areas. On Sonnet it hardly binds (278.1 new lines, no regression). A draft that states the budget (r3) read 1% to 6% fewer lines and was not kept.

| App           | Measure                    | 2026-11-09 (v2) | P10-11 (v3)     | P10-13 (v3, cap 350)    |
| ------------- | -------------------------- | --------------- | --------------- | ----------------------- |
| Asset Manager | call after the reads, mean | 51,698          | 64,901 (+25.5%) | pending P10-13 journeys |
| Asset Manager | last call of an asked task | 74,748          | 87,280 (+17%)   | pending P10-13 journeys |
| Invoice       | call after the reads, mean | 42,598          | 43,497 (+2%)    | pending P10-13 journeys |
| eShop         | call after the reads, mean | 45,179          | 49,727 (+10%)   | pending P10-13 journeys |

**`turns-left`:** three judged Haiku rounds, none kept: t1 gained 0.08 on the judge (DEC-235 asks 0.3) for output +23%, t2 lost on the judge, t3 lost coverage and card form. **The other six prompts** had round 0 on the new measure and no round: three are at the ceiling on held-back, three act on final cards their sets cannot replay. So the card's done-when (three Haiku rounds for every reader prompt) is not met in full. `reader/workbook` has no committed set.

**Keep rule applied:** DEC-235 read with DEC-238 (new lines read is the deterministic quality measure, RF-1410), matched per DEC-237.

**Spend:** P10-05 $4.1303 of the $7 slice (targets $2.7559, judge $1.3744). P10-13 lab $0.4212; its slice is $4.50 (DEC-241); journeys **pending P10-13 journeys**. **Detail:** [reader.md](reader.md), [read-more-cap.md](read-more-cap.md).

### Plan gap and repair prompts (P10-07, #1398, #1411)

**Kept: nothing.** `planner/gap.v6`, `planner/gap-repair.v4`, `planner/plan-repair.v2` and `cards/repair.v6` stay. `plan-repair.v3` was kept in the second fix round and reverted in the third; its text is in the round log.

**What changed in the lab.** The lab prints the count of each label and the follow-ups a run would make: a repair call, a second round, a gap round, a second repair (RF-1403). A plan repair that loses a card, merges or pads its requirements reads `Shrunk`; one that drops an item `LeftOut`; one that leaves a requirement no task lists `Open`. A card repair is merged as the run does. Four `-nojson` cases test an earlier answer that is not JSON (RF-1406).

| Prompt, model (held-back)          | Before (current)                        | After (best candidate)                                  | Result               |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------- | -------------------- |
| plan-repair, Haiku                 | v2: not usable 4 of 6, gap round 6 of 6 | v3: not usable 1 of 6, gap round 1 of 6, output +13.52% | gain                 |
| plan-repair, Sonnet                | v2: not usable 1 of 2, gap round 2 of 2 | v3: 0 of 2, **output +35.5%, latency +37.9%**           | not kept: (c) fails  |
| plan-repair, Opus                  | v2: `Fixed` 2                           | v3: `Fixed` 2, output +0.83%                            | no change            |
| gap, Haiku / Sonnet / Opus         | v6: `Covered` 6 / 1 / 1                 | round 3: `LeftOut` 1 on Haiku; Sonnet output +3%        | not kept: regression |
| gap-repair, Haiku / Sonnet         | v4: `Covered` 6 / 1                     | round 2: `ModulesOpen` 1 on Haiku; Sonnet latency +27%  | not kept: regression |
| card repair, Haiku / Sonnet / Opus | v6: `Fixed` 18 / 5 of 6 / 6             | round 1: 2 `Unusable` on Haiku `-nojson` cases          | not kept: regression |

**Keep rule applied:** DEC-235 with DEC-237: a regression on one model stops a keep, and matched runs are never pooled. Every prompt had at least three Haiku rounds.

**Spend:** $3.3032 of $3.50 (the $3.00 slice plus $0.50 from the reserve). **Detail:** [plan-gap.md](plan-gap.md).

### Verifier and summariser prompts (P10-06, #1412)

**Kept: `verifier/claim.v6`.** `summariser/merge.v2`, `summariser/overview.v1` and `verifier/retry.v1` stay.

**What changed in the lab.** A new set of the 30 hand-labelled calibration claims with a held-back third (RF-1411); the disagreements are counted by kind. Merge labels (`Invalid`, `Lumped`, `Unrelated`, `Thin`) and overview labels (`Empty`, `Lumped`, `Missed`) guard the summariser answers (RF-1412). The verifier's retry is replayed (RF-1413).

`claim` v5 against v6, held-back, 10 cases x 3, matched per model:

| Model  | Agreement, v5 to v6 | False supported | False not supported | First try valid | Cost per run |
| ------ | ------------------- | --------------- | ------------------- | --------------- | ------------ |
| Haiku  | 90% to 90%          | 0 to 0          | 3 to 3              | 90% to 100%     | -23%         |
| Sonnet | 97% to 100%         | 0 to 0          | 1 to 0              | 90% to 97%      | -11%         |
| Opus   | 100% to 100%        | 0 to 0          | 0 to 0              | 100% to 100%    | -11%         |

In the real runs of P10-11 the verifier's retries fell sharply (eShop understand 167 to 26, Deepen 155 to 16). A spot check of 22 Supported claims found none wrong about the code, but 3 of 17 model verdicts rest on the context margin or on part of the evidence (P10-D2).

**Summariser and retry.** The merge round-3 candidate saved 3% of tokens with equal labels (not a gain, since merge counts are a floor without hand labels). The overview round-3 candidate lost a case to `Missed`. Each retry candidate lost a `Supported` verdict on tune that v1 kept.

**Keep rule applied:** DEC-235 (b) on fewer retried answers, with agreement not lower on any model (DEC-237). The 30 claims of RF-305 were the tuning set, so `npm run eval`'s agreement for v6 is in-sample; only the held-back figures count.

**Spend:** $1.1103 of the $3 slice by the ledger (targets $0.6633, judge $0.4470). **Detail:** [verifier-summariser.md](verifier-summariser.md).

### Prompts not tuned in Phase 10

- `planner/options` and `planner/continue`: not wired in the lab.
- `planner/adr-model`: wired, no set (no saved run holds the call).
- `planner/workbook` and `reader/workbook`: local sets only, not used.
- `shared/secret-risk`: no model call.
- `prompts/lab/judge.v1`: the lab's own judge, checked by P10-03, not tuned.

## End to end (P10-11, #1413)

Three apps end to end on Haiku 5.5 on the new `rosetta-p10` stack (from `develop` `cb146766a`), against the evaluation of 2026-11-09:

| Measure                                           | 2026-11-09         | P10-11                      |
| ------------------------------------------------- | ------------------ | --------------------------- |
| Three comparable journeys                         | $2.645             | $2.346 (-11%)               |
| Running time of those journeys                    | 102.5 min          | 95.3 min                    |
| Verifier retry prompts, eShop understand / Deepen | 167 / 155          | 26 / 16                     |
| eShop behaviour kept by no task card              | 14 items (2 cards) | 98 items (13 cards), P10-D6 |
| Package judge, overall (advisory)                 | 2.8 to 3.0         | 3.0 on each app             |

EV-100 (Continue then plan) and EV-108 (requirements built by no card) are fixed. Eight defects are proposed: P10-D6 major, seven minor (see [Proposed follow-up cards](#proposed-follow-up-cards)).

## The judge sample for the owner

The judge (Opus 5.5) agreed with all 12 calibration claims. Its overall score was in the same band as the hand score for verifier 3 of 3, shared 3 of 3, reader 2 of 3, summariser 2 of 3, cards 1 of 3 and planner 1 of 3. So it is trusted for the verifier and shared families, used with care for reader and summariser, and advisory for cards and planner. The hand scores were written by a builder, so the agreement is with one builder's opinion until the owner has read the sample.

**Please read [judge-sample.md](judge-sample.md)** (section "For the owner"): the 18 samples, the samples where the judge differs most (`cards-write-good`, `planner-data-good`), the verifier grounding gap, and whether the proposed default of 80% stands. The owner kept the default (DEC-244 a, question 6 below).

## Spend

**Method.** The shared lab ledger is a JSONL file of `hold`, `settle` and `release` entries. The total is the sum of the `micros` of every `settle` entry: 4,298 entries, **26,128,284 micro-dollars ($26.1283)**, last entry 2026-11-15 00:07 UTC. Two holds of 2026-11-13 21:30 UTC were never settled or released (68,115 and 68,260 micros, **$0.136**); a hold older than 30 minutes that was never settled does not count. The stack's spend is not in the ledger; it comes from the stack's account totals in [end-to-end.md](end-to-end.md).

**Split by card.** The ledger has no card field. Where cards ran alone, the ledger window gives the card's spend exactly; where they ran at the same time, the cards' own docs give the split.

| Card   | Slice                       | Spent                                                                       | Source                                                                 |
| ------ | --------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| P10-01 | none                        | $0 (fake provider only)                                                     | #1392                                                                  |
| P10-02 | none                        | $0 (captured from saved runs)                                               | #1393                                                                  |
| P10-03 | $3                          | $2.5415: rejected key $2.1247, judge check $0.3633, two judged runs $0.0534 | [judge-sample.md](judge-sample.md); ledger to 2026-11-13 20:00 UTC     |
| P10-04 | $6                          | $3.4573 (judge $0.9886)                                                     | [baseline.md](baseline.md); ledger window 20:00 to 21:00 UTC           |
| P10-10 | $1.50                       | about $1.5 (judge $1.3), plus $0.014 of the reserve                         | [shared.md](shared.md)                                                 |
| P10-08 | $6                          | about $4.6                                                                  | [plan-docs.md](plan-docs.md)                                           |
| P10-09 | $4.50                       | $3.66 (no judge)                                                            | [cards.md](cards.md)                                                   |
| P10-05 | $7                          | $4.1303 (judge $1.3744)                                                     | [reader.md](reader.md)                                                 |
| P10-07 | $3.50 (incl. $0.50 reserve) | $3.3032 (no judge)                                                          | [plan-gap.md](plan-gap.md)                                             |
| P10-06 | $3                          | $1.1103 (judge $0.4470)                                                     | ledger window 2026-11-14 06:00 to 09:00 UTC                            |
| P10-11 | $6                          | $3.776: stack $2.523, judge $1.2528 (ledger)                                | [end-to-end.md](end-to-end.md); ledger window 12:00 to 14:00 UTC       |
| P10-13 | $4.50 (DEC-241, was $1.50)  | lab $0.4212; journeys **pending P10-13 journeys**                           | [read-more-cap.md](read-more-cap.md); ledger from 2026-11-14 23:00 UTC |
| P10-12 | none                        | $0                                                                          | this card makes no model call                                          |

Checks of the split against the ledger windows:

- P10-10, P10-08 and P10-09 ran together (2026-11-13 21:00 to 2026-11-14 01:00 UTC): the ledger holds $9.9117 for that window, the three docs give about $9.77. The $0.14 left is in the rounded figures of `shared.md` and `plan-docs.md`.
- P10-05 and P10-07 ran together (01:00 to 05:00 UTC): the ledger holds $7.4335, exactly $4.1303 + $3.3032.
- P10-06: `verifier-summariser.md` gave targets $0.6507 and judge $0.4470, which add up to $1.0977, not its own total of $1.11. The ledger window holds $1.1103, so the targets were $0.6633. The doc is corrected in this card.

**Totals.**

| Item                                           | Amount                      |
| ---------------------------------------------- | --------------------------- |
| Lab ledger, settled                            | $26.1283                    |
| `rosetta-p10` stack (P10-11)                   | $2.523                      |
| **Phase 10 so far**                            | **$28.651**                 |
| of which the rejected key of P10-03 (RST-1518) | $2.1247                     |
| For reference: without the rejected key        | $26.527                     |
| P10-13 stack journeys                          | **pending P10-13 journeys** |
| Room under the $40 stop line                   | $11.35                      |
| Room under the $50 total                       | $21.35                      |

The P10-13 slice is $4.50 (DEC-241), of which $0.4212 is spent. If the journeys spent the whole rest ($4.08), Phase 10 would end at $32.73, under the stop line.

## Lab measures added in Phase 10

- **RF-1403** Metrics and comparison: the count of each label and the rate of each follow-up a run would make (repair call, second round, gap round, second repair) in the summary and `--compare`; per-case counts a check used.
- **RF-1405** Committed case sets: hand-made variants (`-spa`, `-nojson`) take the side of their base case, so a variant never crosses the split.
- **RF-1406** Lab targets: the final-answer turn with no tools for `shared/masked-value` and the card prompts; the `continue` cut from the case's first read with `Restarted` and `Uncovered`; the gap coverage, plan repair (`Shrunk`, `LeftOut`, `Open`) and merged card repair checks.
- **RF-1410** A reader turn that calls tools is graded by what its reads give the read gate: new lines, share gain, stale and generated reads, `NoCards` usable only where a case expects it.
- **RF-1411** The 30 calibration claims as a lab set with a held-back third, and wrong verdicts counted by kind.
- **RF-1412** Merge labels (`Invalid`, `Lumped`, `Unrelated`, `Thin`) with merged-id counts, and overview labels (`Empty`, `Lumped`, `Missed`), as guards.
- **RF-1413** The verifier's retry replayed with a fixed unreadable first answer.
- **RF-1414** The read-more line cap, graded in the lab with the same cut as the run (`cutLines`).

## Owner questions left

The owner answered every question on 2026-11-15 (DEC-242 to DEC-245). Questions 8 and 9 came later from the P10-14 builder (#1416). No question is left open.

1. **The final read-more cap** (P10-13). **Answered (DEC-242):** the owner delegated the choice to the orchestrator, with a rule. Take the largest cap that keeps every app measured in the P10-13 journeys within the +15% of DEC-235 (c), on both the call after the reads and the last call of an asked task, with no rise in failed tasks or wasted repeats: 350 lines with v3 if it holds on Asset Manager, Invoice and eShop; 300 with v3 if any app is over; v2 with a cap if 300 cannot hold either. **Chosen cap: pending P10-13 journeys.**
2. **The $2.12 booked for rejected calls.** P10-03's first judge check ran with a key Anthropic rejected (RST-1518); nothing was answered, but the ledger settled the calls at their worst case, $2.1247. **Answered (DEC-243 c):** it counts toward the Phase 10 total, $28.65 so far.
3. **Re-capture the local lab sets** (`lab/local-cases/`, the Asset Manager and Invoice workbook sets, never committed). They were captured before the second round of lab fixes and may hold twins, an older split and text the masker now masks. **Answered (DEC-243 d):** they are re-captured at the start of the next tuning round, not now, so the comparisons of Phase 10 stay valid.
4. **P10-D6 (plan regression, major): priority.** **Answered (DEC-243 a):** P10-D6 is the next card, before P9-18 and P9-19.
5. **Release Phase 10 to `main`.** Nothing of Phase 9 or Phase 10 is released. **Answered (DEC-243 b):** Phase 10 is released to `main` after the P10-D6 fix is merged; the release stays the owner's (DEC-175).
6. **The judge sample** ([judge-sample.md](judge-sample.md)). **Answered (DEC-244 a):** the default stands. The judge is trusted for a family at 80% of calibration claims and 80% within one point per criterion; a family below that uses the judge as advisory only, as Phase 10 applied it.
7. **`shared/masked-value` v2.** It raises secret-handling from 2.5 to 4.8 on Haiku but adds about 23% output tokens per masked-value answer, over DEC-235 (c). **Answered (DEC-244 b):** v2 is kept by the owner's ruling, as an exception to DEC-235 (c), because the secret-handling gain outweighs +23% output on a small, rare call. Wiring it is card P10-15, in its own pull request; if that card finds the change reaches many calls, the owner gets the facts before it merges.
8. **Behaviour kept by no task card: fail or report?** (from the P10-14 builder, #1416). Should a plan whose `checks.md` lists behaviour kept by no task card fail the run (RST-1806), as a requirement built by no card does, rather than only report it? **Answered (DEC-245 a):** it is reported in `checks.md` only and does not fail the run (RST-1806); it is still listed there.
9. **A requirement that cites an out-of-scope journey** (from the P10-14 builder, #1416). Should it be flagged as inconsistent? **Answered (DEC-245 b):** it stays listed as "kept by no card", with the out-of-scope reason kept in `flows/README.md`; it is not flagged separately.

## Proposed follow-up cards

Proposals only: no GitHub issue and no task card is filed by this report. Each line gives its source. Carded since the report was written: **P10-14**, the P10-D6 fix, which also carries P10-D7 (PR #1416, in review), and **P10-15**, wiring `shared/masked-value` v2 (DEC-244), in its own pull request.

1. P10-D1: `read-more.v3` over +15% per call on Asset Manager; now P10-13 (DEC-239), left: a real run on Sonnet and Opus before it becomes their default (#1413).
2. P10-D2: `verifier/claim.v6` reasons above 150 characters and three verdicts on the context margin; add held-back cases where only the margin shows the claim (#1413).
3. P10-D3: the data-model check of `checks.md` lists a deployment placeholder token as a missing table (#1413).
4. P10-D4: field-presence claims counted apart from the verifier's verdicts; repeat the Asset Manager understand for the feature-card yield (#1413).
5. P10-D5: the DEC-228 env-file order and an evaluation-stack runbook (#1413).
6. P10-D6 (major): behaviour kept by no task card grew on eShop (14 to 98 items); find the cause (gap.v5 against v6) and give each cited item a task card or state it as left out (#1413). **In P10-14** (#1416, in review), the next card (DEC-243 a).
7. P10-D7: data-model "dropped" entries rejected by the schema when one entry lists many fields (#1413). **In P10-14** (#1416).
8. P10-D8: a summariser answer cut at the output limit skips its batch's merges (#1413).
9. The sqlcmd masker redesign, on branch `task/p10-masker-gaps`, with a 674-entry corpus; its pull request #1404 was closed unmerged on 2026-11-13, and the gaps came from the verifier of #1402.
10. Mask before JSON serialization in `src/infrastructure/lab/lab-files.ts`, `cost-report-files.ts`, `calibration-files.ts` and `evaluation-files.ts`; masking the text of `JSON.stringify` broke two `results.json` files (#1406).
11. `joinFragment` strips a leading line break inside a cut string; then re-measure `cards/continue` s1 (#1409).
12. Record the card-format parser's problems per case in `results.json`, so `Partial` and `Unusable` can be read (#1409).
13. The lab's `Restarted` label when the cut claim has no citation (#1409, m1).
14. `Uncovered` misses cards the run folds together (#1409, m3).
15. Merge-check: title words do not match across plurals (invoice, invoices), and the shared-word rule links a chain of cards, a limit the requirements overstate (#1412).
16. Plan repair check: copies that differ only by trailing punctuation or a zero-width space, and the lab stricter than the run on `BR` cards cited in security items (#1411).
17. Hand labels for the summariser merge cases, so `NoMerge` and an extra merge can be told right from wrong (#1412).
18. The read-more file list order: rank behaviour files before generated and descriptor files (#1410).
19. An `expected` label for the `reader-turns-left` held-back `launchSettings.json` case (#1410).
20. Wire `planner/options` and `planner/continue`, and add a `planner/adr-model` set (#1408).
21. A deterministic completeness check for the plan documents, which flows v5 and coverage v3c need before a keep (#1408).
22. Accept a bare JSON line as a tool call in `parseTextAnswer` (Haiku breaks the protocol on about 20% of first turns) (#1406).
23. A multi-ask reader replay: an agent-loop test through three read-more asks with the cap, and a lab case type for the second ask (#1414).
24. Count identical refused reads within one ask toward the loop limit (#1414).
25. The lab and the runtime differ on an unlisted path when the budget is spent (#1414).
26. An out-of-sample verifier calibration set, since `claim.v6` was tuned on the 30 claims of RF-305 (#1412).

## Verifier minors not yet fixed

Minor findings of the verifiers of the Phase 10 pull requests, checked against the current docs.

**Fixed in this card** (one-line wording fixes):

- #1409: `cards.md` (section 7, "The failure differs") said every Sonnet-failing candidate answer began with a line break and that v1 never did in 0 of 45 runs. s5's `Restarted` run is not a line break, and the verifier counted v1 at 0 of 61. The line now says every `Unusable` Sonnet candidate answer, and 0 of 61.
- #1412: `verifier-summariser.md` gave the target spend as $0.6507; the ledger gives $0.6633 (the judge $0.4470, the card $1.1103).
- #1412: `verifier-summariser.md` said no merge round moved a count by more than the noise. Round 3 moved `Merges` by 3 (15 to 18) against a noise of 2 between two v2 runs; the line now says so, and that it is still a floor figure, not a gain.
- #1412: the verifier's round 1 (three changes) and the retry's round 3 (two changes) are now marked as rounds with more than one change, like the others.
- #1411: `plan-gap.md` said a rule card cited only by a risk (probe D) "still asks for its requirement". The check is a count floor: it counts the case's feature and rule cards, so that card raises the floor of distinct requirements, but no single card is matched to a requirement. The line now says so.

**Listed, not fixed:**

- #1409: the red commit `3ea9bf7` failed 4 unrelated tests with ENOENT as well as its own; history, not a doc.
- #1412: RF-305 calibration is in-sample for `claim.v6`. RF-305 and `verifier-summariser.md` already say so; a fresh set is follow-up 26.
- #1412: the red commit of the fix round threw "not wired" instead of failing its assertions; history, not a doc.
- #1412: the `verifier-retry-calibration` set's held-back side (6 `Supported`, 4 `Rejected`) differs from the claim set's (5 and 5) for the same 30 claims, so a claim tuned on one side may be held back on the other. That is a split rule question, not a wording fix.
