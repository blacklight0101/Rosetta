# Prompt lab: a line cap per read-more ask (P10-13)

Card P10-13, 2026-11-15, GitHub issue #1390. The owner ruled "Add a line cap" on the P10-11 result (DEC-239): `reader/read-more.v3` was over the +15% per call of DEC-235 (c) on Asset Manager (the call after the reads +25.5%, the last call of an asked task +17%) and within on eShop and Invoice (`end-to-end.md` section 4.1). Spend: **$3.015** of the slice, which the owner raised from $1.50 to $4.50 on 2026-11-15: lab $0.4212, stack $2.594 (section 7).

**Decision (DEC-246, section 9): `reader/read-more.v2` with no line cap.** It is the only option measured within the +15% of DEC-235 (c) on every app. The keep of 350 below is withdrawn. `read-more.v3` stays in the prompts folder, and the cap of RF-1414 stays in the code, off unless `readMoreLines` is set.

**First result, withdrawn by DEC-246: a cap of 350 lines per ask, enforced in code (RF-1414), with `read-more.v3`.** After a read-more ask, `read_file` serves at most 350 lines until the reader's next answer: a read past the budget is cut from its start line, and one made with no line left is not run (a notice, not a tool error). The arithmetic on the P10-11 Asset Manager task puts the call after the reads at +8.8% to +13.2% against 2026-11-09 (limit +15%). The +13.2% worst case has 1.8 points of margin and depends on how many tokens a line costs (section 2). Drafts that tell the model the budget read fewer new lines than v3 under the same cap, so none is kept. **What the cap costs:** on the lab's held-back cases, where every model reads big areas, v3 under the cap reads no more new lines per turn than v2 under the cap, so the cap gives back the lab gain of v3 (section 4).

**Journeys (section 6): the keep of 350 is not confirmed.** The three apps ran end to end on Haiku on the `rosetta-p10` stack rebuilt with the cap, one run each:

- **Asset Manager: within on both measures.** Against 2026-11-09 the call after the reads is +1.4% and the last call of the asked task -7.5% (P10-11: +25.5% and +17%). But its understand kept fewer cards (6 against 11 and 20), because the reader's last answer was short; the Deepen made most of it up.
- **Invoice: within on the call after the reads (+5.5%), over on the last call of the asked task (+44.8%).** The cap split the one ask of 2026-11-09 into two asks, which read the same 664 lines in all. The extra ask leaves one more refused answer in every later call, which neither model of section 2 counts.
- **eShop (run with the owner's extra budget): within on every measure,** in the understand (+2.6%, +3.1%) and the Deepen (-12.9%, -8.2%), where section 2's worst case at 27.5 tokens a line was +19.9%.
- No task failed. No refused read was repeated within an ask and none became a repeat (RST-1303). One Asset Manager Deepen reader ended at the context limit after three asks, with its cards kept.

The builder left the cap unchanged and set out the choice (section 8). The orchestrator, under the owner's delegation, chose v2 with no cap (DEC-246, section 9).

**Fix round (the verifier's review of #1414).** A read that the budget refused or cut was still recorded for the repeat check. After the next ask, the same call was refused as a repeat, and three such calls could end the task. This is fixed and tested (section 1). The lab figures do not change (section 3), and the lab cannot see this kind of defect (section 5).

Only aggregate figures are written here. The Asset Manager and Invoice runs' files, cards and logs stay outside the repository (owner, 2026-11-14).

## 1. Where the cap lives

| Option                                                                            | For                                                                            | Against                                                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| A total line budget in the prompt only (a v4)                                     | no code change                                                                 | the model can ignore it, and in the lab it reads fewer lines when told the budget (section 4)                                       |
| **A cap in code: the tool runner cuts `read_file` past N lines per ask (chosen)** | the model cannot exceed it; one constant bounds the later calls on every model | the model is not told and may ask for lines past the cap: each such call costs its own output tokens and a short notice (section 4) |
| Both                                                                              | the model knows the budget                                                     | every draft that states it read fewer new lines than v3 under the same cap (section 4)                                              |

How the code cap works (RF-1414, `read-gate.ts`, `read-budget.ts`, `tool-runner.ts`):

- Each read-more ask gives the task a budget of 350 lines (`readMoreLines`). It lasts until the next final answer, and the next ask starts a new one. The reads before the first ask have no cap.
- Every line `read_file` serves counts, a re-read included, because each one stays in the input of the task's later calls.
- A read that asks for more lines than are left is cut from its start line.
- A read made with no line left is not run. The reader gets one data block that says the lines are spent and asks for the final answer. It is not a tool error.
- A read the budget refuses is not recorded for the repeat check (RST-1303). A cut read is recorded as the lines it asked the tool for. So after the next ask, the same call runs within the new budget, and refused reads never count toward the three repeats that end a task. A read served whole and made again is still a repeat.
  - Before the fix round, the runner recorded the call as the model sent it. A refused read made again after the next ask was then answered as a repeat, and three of them ended the task as `repeated-calls`.
- A read the tool would refuse anyway goes to the tool before the budget is applied. That covers invalid arguments and a path outside the repository. The tool refuses it with its RST code, and a path outside the repository is logged as a security event (RF-145), whether or not budget is left.
- `grep`, `codemap_query` and `list_area_files` are not counted or cut.
- The refusal can state the budget through a `{{lines}}` placeholder. `read-more.v3` has none.
- The lab grades a read-more turn with the same cut, in call order. It records `cutLines`, the lines its reads asked for past the cap, and the report prints them.

## 2. The number: why 350

The P10-11 Asset Manager task is the one over the limit: one of its two reader tasks was asked three times. Its calls come from the saved runs (aggregates only).

The lines counted are the numbered file lines the reads served from the ask to the next answer, which is what the cap counts. The data blocks' frame lines are left out; with them the counts are 371, 195, 261 (v2) and 715, 416, 57 (v3).

| Ask  | 2026-11-09 (v2): lines served, call after the reads | P10-11 (v3): lines served, call after the reads |
| ---- | --------------------------------------------------- | ----------------------------------------------- |
| 1    | 361, 37,287                                         | 701, 48,442                                     |
| 2    | 181, 51,349                                         | 402, 67,274                                     |
| 3    | 251, 66,457                                         | 45, 78,988                                      |
| Mean | 264, **51,698**                                     | 383, **64,901 (+25.5%)**                        |

**Tokens per served line: t = 22.5.** On P10-11 Asset Manager, asks 1 and 2:

- For each ask, take the input tokens of the call after the reads, minus those of the call that carried the ask.
- Subtract that call's own output (the model's tool calls, which also go into the next input): 911 and 837 tokens.
- Divide by the numbered lines served: (16,805 - 911 + 9,735 - 837) / (701 + 402) = 24,792 / 1,103 = **22.5 tokens a line**. This includes the frame and each line's number prefix.
- Ask 3 is left out: its 45 lines came in seven small reads, at 44.8 tokens a line, so the fixed cost of each read dominates.

The first version of this page used 23.5, because it counted the model's output and the frame lines. `reader.md` used "about 12 tokens a line", about half the real figure, which is one reason its estimate of +1.1k tokens per ask was low. The figure also depends on the files. With the same rule, a served line cost 24.5 tokens on the eShop understand, 25.1 on Invoice and 27.5 on the eShop Deepen.

**Limits.**

- The call after the reads may be at most 51,698 x 1.15 = **59,453** tokens.
- The last call of the task may be at most 74,748 x 1.15 = **85,960** tokens (P10-11: 87,280).

**Two models of what a cap of N lines does**, with L = 701, 402, 45 and t = 22.5:

- **(A) Same reads, cut.** Each ask's reads are cut at N. Ask j's call after the reads falls by t x the sum of (L_i - N) over the asks up to j where L_i is above N.
- **(B) Fills the cap.** Every ask serves exactly N lines, like a reader that, once cut, reads the rest of the file at the next ask. Ask j's call falls by t x (the P10-11 lines up to ask j - j x N). This is the worst case **for the number of lines**, not for tokens: it assumes the lines kept cost the same t as the lines cut.

| N       | (A) lines saved by ask 1, 2, 3; mean | (A) call after the reads | (A) last call      | (B) lines saved by ask 1, 2, 3; mean | (B) call after the reads | (B) last call         |
| ------- | ------------------------------------ | ------------------------ | ------------------ | ------------------------------------ | ------------------------ | --------------------- |
| 300     | 401, 503, 503; 469.0                 | 54,348 (+5.1%)           | 75,962 (+1.6%)     | 401, 503, 248; 384.0                 | 56,261 (+8.8%)           | 81,700 (+9.3%)        |
| **350** | **351, 403, 403; 385.7**             | **56,223 (+8.8%)**       | **78,212 (+4.6%)** | **351, 403, 98; 284.0**              | **58,511 (+13.2%)**      | **85,075 (+13.8%)**   |
| 400     | 301, 303, 303; 302.3                 | 58,098 (+12.4%)          | 80,462 (+7.6%)     | 301, 303, -52; 184.0                 | 60,761 (+17.5%, over)    | 88,450 (+18.3%, over) |
| 450     | 251, 251, 251; 251.0                 | 59,253 (+14.6%)          | 81,632 (+9.2%)     | 251, 203, -202; 84.0                 | 63,011 (+21.9%, over)    | 91,825 (+22.8%, over) |

Worked example, N = 350, model (B):

1. The mean of 351, 403 and 98 is 284.0 lines.
2. At 22.5 tokens a line, that is 6,390 tokens.
3. 64,901 - 6,390 = 58,511, which is +13.2% against 51,698.
4. The last call falls by 98 x 22.5 = 2,205, to 85,075 (+13.8%).

**350 is the largest round N that stays within +15% under model (B).** The margin is 1.8 points on the call after the reads and 1.2 points on the last call; 400 is over under (B).

The margin depends on what a line costs. Suppose the lines that (B) keeps cost 25.1 tokens each (Invoice's figure) instead of 22.5:

- The mean call after the reads becomes 64,901 - 22.5 x 984 + 25.1 x 700 = 60,331 (+16.7%), which is over. Here 984 is the mean of the cumulative P10-11 lines (701, 1,103, 1,148) and 700 the mean of the cumulative capped lines (350, 700, 1,050).
- At N = 300 the same check gives 57,821 (+11.8%), which is within.
- At the eShop Deepen's 27.5 tokens a line, the dearest figure measured, it gives 64,901 - 22.5 x 984 + 27.5 x 700 = 62,011 (**+19.9%, over**) at N = 350, and 64,901 - 22,140 + 27.5 x 600 = 59,261 (+14.6%, within) at N = 300.

Neither model counts a shorter answer after fewer reads. Both assume the rest of the task stays as it was, which one real run cannot confirm. The journeys of section 6 show where this fails: on Invoice the cap added an ask, and the last call of the task rose by 44.8%. Section 8 sets out the choice for the owner.

**How often the cap cuts, per app.** The table covers every read-more ask of the 2026-11-09 and P10-11 runs. Lines are the numbered lines served from the ask to the next answer (aggregates only).

`end-to-end.md` section 4.1 counted differently: only the asks whose next call was logged, with frame lines included. That is why it gives 226 and 484 lines per ask for eShop.

| Run                          | Asks | Lines per ask: mean, median, max | Asks above 350 |
| ---------------------------- | ---- | -------------------------------- | -------------- |
| Asset Manager understand, v2 | 3    | 264, 251, 361                    | 1 of 3         |
| Asset Manager understand, v3 | 3    | 383, 402, 701                    | 2 of 3         |
| Invoice understand, v2       | 1    | 664                              | 1 of 1         |
| Invoice understand, v3       | 1    | 417                              | 1 of 1         |
| eShop understand, v2         | 23   | 196, 190, 426                    | 2 of 23 (9%)   |
| eShop understand, v3         | 21   | 450, 355, 1,798                  | 11 of 21 (52%) |
| eShop Deepen, v2             | 17   | 211, 156, 581                    | 3 of 17 (18%)  |
| eShop Deepen, v3             | 12   | 301, 330, 666                    | 5 of 12 (42%)  |

So the cap does more than trim v3's extra reads:

- On Invoice it cuts below both v2 (664 lines) and v3 (417).
- On every app, some v2 asks were also above 350.
- On the P10-11 figures, the cap can only lower the per-call measures, which were already within the limit on eShop and Invoice.

## 3. Method

As `reader.md`: the `reader-read-more` set (5 tune and 5 held-back eShopModernizing cases, captured from public code) and the RF-1410 grading of the first tool turn after the refusal, now with the run's cut (RF-1414).

- Every run graded here uses the cap of 350 lines.
- `cutLines` is what the cap removed from that same run's reads, so "new + cut" is close to what the same answers read without the cap: a matched comparison of the cap alone, in one run.
- Keep rules: DEC-231, DEC-235, DEC-237 (no regression on every model measured, matched held-back runs, never pooled) and DEC-238 (a deterministic measure of what the prompt is for, here the new lines, counts as quality).
- Haiku 5.5 first, then one Sonnet 5.5 run. Lab command as in the runbook, through the shared ledger.
- The fix round changed how a read that the cap refused or cut is recorded for the repeat check (section 1). No run here had a repeat (`repeats` is 0 on every row), so regrading them gives the same figures, and no round was run again.

## 4. Lab results

**Rounds on tune (Haiku, 5 cases x 3, cap on).** A draft "v4" adds the budget to v3 in one place:

| Run      | Prompt | Change from v3                                                                                                                                                                                 | New lines (cut) | Stale | Labels                         | Half | Out / latency |
| -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----- | ------------------------------ | ---- | ------------- |
| `235910` | v3     | none (the code cap alone)                                                                                                                                                                      | 323.5 (108.4)   | 0.67  | ReadsFiles 8, ReadsWithWaste 7 | 9/15 | 729 / 2.9 s   |
| `235955` | r1     | "Before your next answer you may read at most {{lines}} lines in all: a read past that is cut, so spend them on the files with the most behaviour first", in place of "up to 400 lines a call" | 267.3 (0)       | 0     | ReadsFiles 15                  | 9/15 | 596 / 2.7 s   |
| `000058` | r2     | v3 plus "You may read {{lines}} lines in all before your next answer; a read past that is cut."                                                                                                | 254.2 (0)       | 0     | ReadsFiles 15                  | 7/15 | 699 / 2.9 s   |
| `000157` | r3     | v3 plus "Read {{lines}} lines in all before your next answer: that is what this turn allows."                                                                                                  | 304.3 (0)       | 0     | ReadsFiles 15                  | 9/15 | 701 / 3.0 s   |

When told the budget, Haiku stops short of it: 267, 254 and 304 new lines against 324 for v3 cut by the code. For reference, P10-05 on tune without a cap: v2 310.5 (7/15 half), v3 440.7 (9/15). r3 went to held-back as the best candidate.

**Matched held-back runs (5 cases x 3, cap on).**

| Model      | Run      | Prompt | New lines (cut) | New + cut | Stale | Labels                          | Output | Latency | Cost per run |
| ---------- | -------- | ------ | --------------- | --------- | ----- | ------------------------------- | ------ | ------- | ------------ |
| Haiku (1)  | `000254` | v2     | 299.8 (78.5)    | 378.3     | 0.93  | ReadsFiles 8, ReadsWithWaste 7  | 747    | 3.0 s   | $0.0163      |
| Haiku (1)  | `000340` | v3     | 300.9 (167.7)   | 468.6     | 1.27  | ReadsFiles 7, ReadsWithWaste 8  | 773    | 2.9 s   | $0.0166      |
| Haiku (1)  | `000428` | r3     | 296.9 (3.8)     | 300.7     | 0     | ReadsFiles 15                   | 666    | 2.9 s   | $0.0158      |
| Haiku (2)  | `000517` | v3     | 313.7 (209.0)   | 522.7     | 1.60  | ReadsFiles 5, ReadsWithWaste 10 | 843    | 3.1 s   | $0.0171      |
| Haiku (2)  | `000606` | r3     | 294.5 (1.4)     | 295.9     | 0     | ReadsFiles 15                   | 644    | 3.0 s   | $0.0157      |
| Sonnet 5.5 | `000718` | v3     | 278.1 (1.0)     | 279.1     | 0     | ReadsFiles 15                   | 397    | 2.8 s   | $0.2805      |

No turn reaches 50% (the held-back areas are large), as in P10-05. Input tokens per call are within 1% of each other on every row.

- **The cap binds on Haiku and hardly at all on Sonnet.**
  - Haiku: 9 and 10 of v3's 15 held-back turns hit the cap.
  - Haiku's uncut figures (468.6 and 522.7 new + cut) are at or above P10-05's uncapped v3 (441.5 and 469.9). So the cut, not a change of behaviour, is what lowers its reads.
  - Sonnet: one turn hit the cap (1.0 line cut per turn). Its 278.1 new lines and 15 of 15 `ReadsFiles` match P10-05's uncapped Sonnet v3 (288.1, 15 of 15). So the cap brings no regression on Sonnet.
- **On held-back the cap takes v3's lab gain back.**
  - v2 and v3 under the cap read the same new lines (299.8 and 300.9). Three of the five held-back cases are at 349 to 350 for both prompts.
  - Without the cap, v2 read about 378 a turn on these cases, so on large areas the capped reader reads about a fifth fewer new lines per turn than v2 did.
  - This is the trade DEC-239 asked for, at its far end: on these cases most turns of both prompts are above the cap.
  - Real runs differ by app (section 2). On eShop most v2 asks were below 350 (21 of 23 in the understand, 14 of 17 in the Deepen), while about half of v3's were above it. There the cap still lets an ask read more than v2 usually did.
  - On Asset Manager one v2 ask of three was above 350, and on Invoice the one v2 ask was too (664 lines). There the cap reads less than v2 did.
- **r3, a v4 that states the budget, is not kept.**
  - Against v3 under the same cap it reads fewer new lines on both Haiku pairs (-1.3% and -6.1%) and on tune (-5.9%). That is a regression on the measure the prompt is for (DEC-237, DEC-238), although small.
  - What it gains: no read past the cap (stale 0 against 1.27 and 1.60), output -14% and -24%, cost -5% and -8%.
  - Under the keep rule, a version that regresses the quality measure is not kept for lower cost.
  - What v3's calls past the cap cost in a run, after the fix round:
    - each is a tool call in the model's output, already inside the output figures above (773 and 843 tokens a call for v3, against 666 and 644 for r3);
    - each gets back a notice of a few dozen tokens;
    - both the call and the notice stay in the input of the task's later calls;
    - it is not a tool error, it is not recorded for the repeat check, and the same call runs after the next ask.
  - **Before the fix, this did not hold.** Such a call was recorded, so when it was made again after the next ask it was refused as a repeat (RST-1303), and the third one ended the task with its cards lost. The first version of this page called these calls cheap and used that against r3, without checking what happens at the next ask. The verifier found it with a probe across two asks.
  - The r3 decision does not change. It rests on r3's lower new lines, not on the cost of v3's extra calls. What r3 would save (output -14% to -24%) is a trade the owner can still weigh (section 8).
  - Not run: Sonnet on r3, as r3 was already out on Haiku.

**Keep decision.** The code cap of 350 lines with the prompt `read-more.v3` (no new prompt version). It is a code change, not a prompt version, so the keep rules apply only to the prompt choice (v3 kept, r3 not). The cap itself is DEC-239's ruling. The journeys (section 6) found it within +15% on Asset Manager and eShop and over on Invoice's last call, so the keep of 350 is not confirmed. It is withdrawn by DEC-246 (section 9).

## 5. What the lab does not see

The lab grades one tool turn after one ask (RF-1410, RF-1414). A defect that only shows at a second ask cannot show there. The repeat defect of the fix round was one: the first version of the cap passed every lab round with it.

The tool runner's tests now cover two asks (`tool-runner-budget-asks.test.ts`). No test yet runs a reader through several asks end to end.

**Proposed follow-up card (text only, not filed): "Replay a reader task across read-more asks".** Difficulty 6, size S, depends on P10-13.

- Add an integration test of the agent loop with recorded responses (ADR-008). It runs one reader task through three read-more asks with the cap: a read refused at the first ask, the same read made again after the second, then a final answer.
- The test checks that the task ends with its cards rather than RST-1303, and records the lines served per ask.
- If it is worth the cost, also add a lab case type that replays two asks (the reads of the first ask, the refusal, a second ask), so that a prompt's behaviour at the second ask can be graded too.

## 6. Journeys on the rosetta-p10 stack

**Method.** The `rosetta-p10` stack (127.0.0.1:18098) was rebuilt on 2026-11-15 from `develop` `d2349f9ba`, which has the cap (#1414). The image was built at 08:55 UTC. The database and data volumes were kept, and no migration was pending. Compose got the same two env files as P10-11, and `OPENAI_API_KEY` stayed empty.

- The journeys ran through the API with P10-11's driver, copied with its own state: every role on Haiku 5.5, reader `maxTurns` 12, parallelism 4, then scan, understand, answers (one picked, one typed), Deepen, answers, and the Plan with the 2026-11-09 brief.
- Asset Manager was approved at $4.00, the run cap, as on 2026-11-09 (P10-11 used $1.50 by mistake).
- Invoice was approved at $0.10, with the user day cap lowered around the understand start, as in both earlier runs. Its Deepen pauses were answered Continue, Stop here, Resume, then Continue (EV-84).
- eShopModernizing was added after the owner raised the card's slice to $4.50 on 2026-11-15. It ran with the settings of P10-11 and was approved at $4.00 (50M tokens), as in P10-11. The API returned P10-11's eShop project for the same URL (one project per URL and user), so the journey ran in that project after a new scan. Its estimate therefore came from history instead of assumptions; the approved amount is the same.
- The measures follow section 2 and `end-to-end.md` section 4.1. They are taken on the understand runs, where every 2026-11-09 and P10-11 ask of Asset Manager and Invoice happened. The Deepens' asks are given apart.
- Lines are the numbered file lines `read_file` served from the ask to the next answer. Model output and frame lines are not counted.
- A cut read asked for more lines than the ask had left. A refused read was made with none left and got the "Not read" notice.
- Percentages are against 2026-11-09 (v2), then against P10-11 (v3 with no cap).

**Per app, understand runs.**

| App           | Measure                     | 2026-11-09 (v2)  | P10-11 (v3)     | P10-13 (v3, cap 350)              | Against v2 | Against P10-11 | +15% of DEC-235 (c) |
| ------------- | --------------------------- | ---------------- | --------------- | --------------------------------- | ---------- | -------------- | ------------------- |
| Asset Manager | call after the reads, mean  | 51,698           | 64,901          | 52,427                            | +1.4%      | -19.2%         | within              |
| Asset Manager | last call of an asked task  | 74,748           | 87,280          | 69,151                            | -7.5%      | -20.8%         | within              |
| Asset Manager | mean reader call            | 37,461           | 45,261          | 33,536                            | -10.5%     | -25.9%         | within              |
| Asset Manager | asks; lines per ask         | 3; 361, 181, 251 | 3; 701, 402, 45 | 3; 350, 350, 337                  |            |                |                     |
| Asset Manager | lines per ask, mean         | 264              | 383             | 346                               |            |                |                     |
| Asset Manager | asks above 350 lines served | 1 of 3           | 2 of 3          | 0 of 3 (the cap bound on 2)       |            |                |                     |
| Invoice       | call after the reads, mean  | 42,598           | 43,497          | 44,953                            | +5.5%      | +3.3%          | within              |
| Invoice       | last call of an asked task  | 42,598           | 43,497          | 61,688                            | +44.8%     | +41.8%         | **over**            |
| Invoice       | mean reader call            | 20,270           | 21,635          | 30,610                            | +51.0%     | +41.5%         | **over**            |
| Invoice       | asks; lines per ask         | 1; 664           | 1; 417          | 2; 350, 314                       |            |                |                     |
| Invoice       | lines per ask, mean         | 664              | 417             | 332                               |            |                |                     |
| Invoice       | asks above 350 lines served | 1 of 1           | 1 of 1          | 0 of 2 (the cap bound on 1)       |            |                |                     |
| eShop         | call after the reads, mean  | 45,179           | 49,727          | 46,342                            | +2.6%      | -6.8%          | within              |
| eShop         | last call of an asked task  | 60,108           | 68,441          | 61,942                            | +3.1%      | -9.5%          | within              |
| eShop         | mean reader call            | 16,439           | 16,517          | 16,667                            | +1.4%      | +0.9%          | within              |
| eShop         | asks (tasks with an ask)    | 23 (10 of 98)    | 21 (11 of 98)   | 23 (11 of 98)                     |            |                |                     |
| eShop         | lines per ask: mean, median | 196, 190         | 450, 355        | 265, 303                          |            |                |                     |
| eShop         | asks above 350 lines served | 2 of 23 (9%)     | 11 of 21 (52%)  | 0 of 23 (the cap bound on 8, 35%) |            |                |                     |

The Deepens, where eShop's asks cost the most per line (27.5 tokens, section 2):

| App           | Measure                         | 2026-11-09 (v2) | P10-11 (v3)   | P10-13 (v3, cap 350)              | Against v2 | Against P10-11 | +15% of DEC-235 (c) |
| ------------- | ------------------------------- | --------------- | ------------- | --------------------------------- | ---------- | -------------- | ------------------- |
| eShop         | call after the reads, mean      | 41,348          | 39,035        | 35,994                            | -12.9%     | -7.8%          | within              |
| eShop         | last call of an asked task      | 48,017          | 49,552        | 44,096                            | -8.2%      | -11.0%         | within              |
| eShop         | mean reader call                | 17,034          | 15,181        | 16,290                            | -4.4%      | +7.3%          | within              |
| eShop         | asks (tasks with an ask)        | 17 (8)          | 12 (5)        | 19 (9)                            |            |                |                     |
| eShop         | lines per ask: mean, median     | 211, 156        | 301, 330      | 260, 266                          |            |                |                     |
| eShop         | asks above 350 lines served     | 3 of 17 (18%)   | 5 of 12 (42%) | 0 of 19 (the cap bound on 7, 37%) |            |                |                     |
| Asset Manager | asks; lines per ask             | 1; 112          | none          | 3 in one task; 215, 350, 296      |            |                |                     |
| Asset Manager | call after the reads; last call | 50,353; 50,353  | none          | 76,511; 99,920                    | other task | no ask         |                     |
| Invoice       | asks; lines per ask             | none            | none          | 1; 211                            |            |                |                     |
| Invoice       | call after the reads; last call | none            | none          | 45,980; 51,318                    | no ask     | no ask         |                     |

**Asset Manager: within on both measures.** The task asked three times, as in both earlier runs. The cap cut the first two asks (two cut reads, 357 lines asked past the cap, nine refused reads), and every per-call measure fell below 2026-11-09. The call after the reads is +1.4%, below even model (A)'s +8.8% of section 2. The asks also came earlier in this run: the calls that carried them averaged 43,857 input tokens against 55,125 in P10-11.

One result goes the wrong way. The reader's answer after its third ask, the one that is kept, was short: 4.7k characters against 22.7k in P10-11. So the understand kept 6 cards and 14 Supported claims (2026-11-09: 20 and 63; P10-11: 11 and 60), at 23.1% coverage. The Deepen made up most of it (18 cards, 82 Supported claims, 100% coverage), and the plan built as many task cards as before. One run cannot tell whether the cap caused the short answer.

The Asset Manager Deepen asked too (P10-11's did not; 2026-11-09's asked once, in another task). Its one task with three asks ended `TurnLimitReached` at its eighth call, on the context limit (RST-1305), after its last answer; its cards were kept. The cap cut its third ask (one read cut, six refused), and three of the refused reads ran after the next ask.

**Invoice: the call after the reads is within, the last call of the task is over.** The cap split v2's one ask into two:

1. Under v2 the reader read 664 lines after one ask, and its next answer was accepted. P10-11's v3 read 417.
2. Under the cap, the first ask served 350 lines: one read was cut by 92 lines and five reads were refused. The reader had still read less than half of its area, so its next answer was refused again.
3. The second ask served 314 lines, 664 in all, as many as v2 read after its one ask.
4. Each extra ask leaves one more refused answer (here 8,192 output tokens, cut at the limit) and one more ask in the conversation. The call after the second ask's reads carried 53,397 tokens (+25.4% against 42,598), and its answer stopped at the 8,192-token output limit. The continuation call carried 61,688 (+44.8%).

Neither model of section 2 counts an extra ask: both assume the rest of the task stays as it was. When a task needs more than 350 lines to reach half its area, the cap moves the reads to a later ask instead of removing them, and each ask adds a refused answer to every later call. The mean reader call rose for the same reason: 9 reader calls instead of 7, the later ones larger.

**eShop: within on every measure, in the understand and the Deepen.** The cap bound on about a third of the asks (8 of 23 and 7 of 19 asks reached it), where half of v3's asks went above 350 without it. Asks per run went back to v2's level (23 and 19, against v3's 21 and 12), and lines per ask sit between v2's and v3's. The Deepen's worst case of section 2 at 27.5 tokens a line (+19.9%) did not occur: its call after the reads fell 12.9% against 2026-11-09. Coverage rose a little against both runs (understand 37.6%, Deepen 47.8%).

**Cut and refused reads, and wasted repeats.**

| Run                      | Reads served after an ask | Cut reads (lines asked past the cap) | Refused reads | Same read refused again later | Refused, then run at a later ask | Refused read repeated in one ask | RST-1303 | Turn limit                          |
| ------------------------ | ------------------------- | ------------------------------------ | ------------- | ----------------------------- | -------------------------------- | -------------------------------- | -------- | ----------------------------------- |
| Asset Manager understand | 6                         | 2 (357)                              | 9             | 2                             | 3                                | 0                                | 0        | none                                |
| Asset Manager Deepen     | 11                        | 1 (50)                               | 6             | 0                             | 3                                | 0                                | 0        | 1 task, context limit, not a repeat |
| Invoice understand       | 7                         | 1 (92)                               | 5             | 0                             | 3                                | 0                                | 0        | none                                |
| Invoice Deepen           | 9                         | 0                                    | 0             | 0                             | 0                                | 0                                | 0        | none                                |
| eShop understand         | 102                       | 8 (650)                              | 11            | 1                             | 1                                | 0                                | 0        | none                                |
| eShop Deepen             | 62                        | 8 (909)                              | 8             | 0                             | 0                                | 0                                | 0        | none                                |

- No refused read was made again within the same ask. No task got a repeat refusal (RST-1303) or ended on repeated calls, so no task reached the turn limit by repeating a refused read.
- Refused reads came in the same tool turn as the read that spent the budget: Haiku sends its reads in parallel, so the reads after the one that reaches 350 are refused together.
- Wasted refused calls: 39 in the six runs, in 13 reader tasks. Each is a tool call in the model's output and gets a short notice. Three were the same read refused at two asks in a row; two of them ran at the ask after that.

**Journeys.**

| App           | Measure                                                 | 2026-11-09                                               | P10-11                               | P10-13                                                   |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| Asset Manager | Understand: calls, cost; cards, Supported, coverage     | 97, $0.053; 20, 63, 20.7%                                | 86, $0.057; 11, 60, 28.1%            | 32, $0.031; 6, 14, 23.1%                                 |
| Asset Manager | Deepen: calls, cost; cards, Supported, coverage         | 96, $0.075; 23, 107, 96.7%                               | 188, $0.117; 19, 186, 100%           | 111, $0.077; 18, 82, 100%                                |
| Asset Manager | Plan: task cards; behaviour kept by no task card, items | 17; 0                                                    | 16; 8                                | 17; 0                                                    |
| Asset Manager | Journey cost (understand + Deepen + plan)               | $0.151                                                   | $0.200                               | $0.126                                                   |
| Asset Manager | Failed tasks                                            | none                                                     | none                                 | none (1 Deepen reader at the context limit, cards kept)  |
| Invoice       | Understand: calls, cost; cards, Supported, coverage     | 76, $0.032; 23, 51, 61.3%                                | 80, $0.038; 21, 63, 61.1%            | 118, $0.058; 31, 90, 60.6%                               |
| Invoice       | Deepen: calls, cost; cards, Supported, coverage         | 241, $0.129; 39, 172, 100% (3 pauses, Stop here, Resume) | 73, $0.044; 24, 100, 100% (no pause) | 265, $0.175; 32, 226, 100% (5 pauses, Stop here, Resume) |
| Invoice       | Plan: task cards; behaviour kept by no task card, items | 16; 19                                                   | 20; 0                                | 19; 0                                                    |
| Invoice       | Journey cost (understand + Deepen + plan)               | $0.189                                                   | $0.103                               | $0.262                                                   |
| Invoice       | Failed tasks                                            | 1 reader `StoppedByCap`                                  | none                                 | none                                                     |
| eShop         | Understand: calls, cost; cards, Supported, coverage     | 1,832, $0.781; 314, 1,294, 36.0%                         | 1,677, $0.746; 342, 1,308, 36.5%     | 1,655, $0.735; 326, 1,278, 37.6%                         |
| eShop         | Deepen: calls, cost; cards, Supported, coverage         | 1,477, $0.797; 354, 2,163, 46.8%                         | 1,093, $0.649; 365, 2,011, 46.2%     | 1,155, $0.699; 378, 2,048, 47.8%                         |
| eShop         | Plan: task cards; items built per card, mean            | 35; 2.5                                                  | 28; 1.9                              | 38; 1.2                                                  |
| eShop         | Behaviour kept by no task card (P10-D6): items (cards)  | 14 (2)                                                   | 98 (13)                              | 44 (3: 2 `FEAT`, 1 `FLOW`)                               |
| eShop         | Data-model entries rejected by the schema (P10-D7)      | 0                                                        | 7                                    | 3                                                        |
| eShop         | Journey cost (understand + Deepen + plan)               | $2.305                                                   | $2.042                               | $2.109                                                   |
| eShop         | Failed tasks                                            | none                                                     | none                                 | none (98 and 100 reader tasks `Done`)                    |

- The Invoice Deepens are not like for like. P10-11's finished inside the $0.10 with no pause. This understand spent $0.058 of it, so the Deepen reached the approval and went through the EV-84 pauses, as on 2026-11-09, which re-runs part of a round. Its cost and its larger card and claim counts come mostly from that.
- eShop's behaviour kept by no task card fell from 98 items to 44, with 38 task cards instead of 28. The planner prompts and code are the same as in P10-11, and one run each cannot separate this from run-to-run variance, so this card does not credit it to the cap. P10-D6 stays open.
- Server log of the three journeys: 1,353 lines, 0 `error`, 65 `warn`, no HTTP 5xx. The warnings are of the kinds P10-11 listed: readers that ended with no card, skipped screen merges, self-family verifier notices, 9 RST-1600 budget refusals at the Invoice Deepen's pauses, one RST-1305 (the Asset Manager Deepen reader), three tool refusals (RST-1104, RST-1107, RST-1306), and the plans' data-model and PRD notices.

## 7. Spend

The owner raised the card's slice from $1.50 to $4.50 on 2026-11-15, to run eShop too (stop at $3.80).

| Part                                      | Runs                                        | Cost        |
| ----------------------------------------- | ------------------------------------------- | ----------- |
| Haiku tune: v3 and three drafts           | 4 x 15 calls                                | $0.0591     |
| Haiku held-back: two matched pairs and v2 | 5 x 15 calls                                | $0.0815     |
| Sonnet held-back: v3                      | 15 calls                                    | $0.2805     |
| **Lab total**                             | 10 invocations, 150 calls                   | **$0.4212** |
| Stack: Invoice Generator journey          | understand, Deepen, plan                    | $0.262      |
| Stack: Asset Manager journey              | understand, Deepen, plan                    | $0.126      |
| Stack: eShopModernizing journey           | understand, Deepen, plan                    | $2.109      |
| Stack: Plan setup options                 | one call per app (by difference)            | $0.097      |
| **Stack total**                           | the stack's month-to-date, $2.523 to $5.118 | **$2.594**  |
| **Card total**                            |                                             | **$3.015**  |

The stack's spend is its own administrator figure (server month to date), read before the first journey and after the last. The shared ledger's settled total went from $25.707 to $26.128 for the lab rounds; the journeys made no lab or judge call. No judge was used: RF-1410 makes no judge call on a tool turn. Ollama was not used. The fix round made no model call.

## 8. Choice for the owner (the record before DEC-246)

What the evidence says, whatever the choice:

- **Later calls on real runs (section 6), one run per app, against 2026-11-09:**
  - Asset Manager: within on both measures (+1.4% and -7.5%), where v3 with no cap was over (+25.5% and +17%);
  - eShop: within on both measures in the understand (+2.6%, +3.1%) and the Deepen (-12.9%, -8.2%);
  - Invoice: within on the call after the reads (+5.5%), over on the last call of the asked task (+44.8%) and on the mean reader call (+51%). The cap turned one ask into two that read the same 664 lines, and the extra refused answer stays in every later call.
- **The arithmetic (section 2)** bounds the call after the reads for the same number of asks. It does not count an ask that the cap adds. On the P10-11 Asset Manager task, 350 gives +8.8% to +13.2% (+16.7% at 25.1 tokens a line, +19.9% at 27.5); 300 gives +5.1% to +8.8% (+14.6% at 27.5); 400 is over in the worst case (+17.5%).
- **Lines read in real runs.** Under the cap, lines per ask were 346 on Asset Manager (v2 264, v3 383), 332 on Invoice (v2 664, v3 417), and 265 and 260 on eShop's understand and Deepen (v2 196 and 211, v3 450 and 301). The cap bound on about a third of eShop's asks.
- **Cards.** The capped Asset Manager understand kept 6 cards against 11 and 20, from a short last answer; the Deepens and plans of the three apps came out at or near the earlier runs. One run each cannot tell the cap from run-to-run variance.
- **Lines read in the lab.** On the held-back cases, v3 and v2 under a cap of 350 read about the same new lines per turn (300.9 and 299.8), and v2 does it with slightly less output (747 against 773 tokens a call). Without a cap, v2 read about 378 and v3 469 to 523. On Sonnet the cap hardly binds.
- **The prompt.** A prompt that states the budget (r3) reads 1% to 6% fewer new lines than v3 under the same cap. It makes no call past the cap and produces 14% to 24% less output.

The options, in no order:

1. **Cap of 350 with v3**, as `develop` has it. Within +15% on Asset Manager and eShop in these runs; over on Invoice's last call, where the cap added an ask.
2. **Cap of 300 with v3.** A lower worst case for the same asks; it would cut more asks, and on a task like Invoice's it may add more asks. Not run on the journeys.
3. **Cap of 400 with v3.** Fewer cut asks and possibly fewer added asks; over +15% in section 2's worst case. Not run on the journeys.
4. **Cap of 350 with v2.** In the lab, v2 under the cap reads about the same new lines as v3 (299.8 against 300.9) with slightly less output (747 against 773). Not run on the journeys.
5. **Revert to v2 with no cap.** The figures go back to those of 2026-11-09. v2's own asks went above 350 on Invoice and on some Asset Manager and eShop asks.
6. **Any cap, with r3 in place of v3.** Less output and no calls past the cap, for 1% to 6% fewer new lines per turn. Not run on the journeys.
7. **Change what follows a cut ask (new code, not built or measured).** The Invoice overrun comes from the answer after a cut ask being refused again because the area is still under half read. The read-more gate could, for example, count the cap's lines as enough for that ask. This needs its own requirement and lab round. DEC-246 keeps a form of it as the proposed follow-up (section 9).

The cap is one constant (`readMoreLines`), so changing N is a one-line change plus a regrade of the lab runs. Options 2 to 7 would need their own journey run to be confirmed.

## 9. Decision (DEC-246)

The orchestrator chose under the owner's delegation ("choose the best option for the system"). DEC-246 is recorded in the decision log by another pull request. **`reader/read-more.v2` with no line cap**, the behaviour of 2026-11-09:

- **Invoice's last call is +44.8% at 350, and the cause is mechanical, not noise.** The cap splits v2's single 664-line ask into two. The extra refused final answer (8,192 output tokens) stays in every later call.
- **Every capped option fails Invoice for the same reason.** DEC-242's fallback assumed a lower cap costs less, and on Invoice it does not. A cap of 300 splits the ask further. v2 with a cap splits it the same way, since v2 read 664 lines in one ask. No more spend goes on showing it.
- **v3 with no cap is over on Asset Manager** (+25.5% and +17%, P10-11).
- **v2 with no cap is the only option within DEC-235 (c) on every app measured.** What it gives up is small: v3 with the cap read 23% to 35% more lines per ask than v2 on Asset Manager and eShop (346 against 264; 265 and 260 against 196 and 211), though half as many on Invoice (332 against 664), and eShop coverage was 1.0 to 1.6 points higher.

| App           | Measure                    | v2, no cap (2026-11-09) | v3, no cap (P10-11) | v3, cap 350 (P10-13) |
| ------------- | -------------------------- | ----------------------- | ------------------- | -------------------- |
| Asset Manager | call after the reads, mean | 51,698                  | +25.5% (over)       | +1.4% (within)       |
| Asset Manager | last call of an asked task | 74,748                  | +17% (over)         | -7.5% (within)       |
| Invoice       | call after the reads, mean | 42,598                  | +2% (within)        | +5.5% (within)       |
| Invoice       | last call of an asked task | 42,598                  | +2% (within)        | +44.8% (over)        |
| eShop         | call after the reads, mean | 45,179                  | +10% (within)       | +2.6% (within)       |
| eShop         | last call of an asked task | 60,108                  | +14% (within)       | +3.1% (within)       |

Percentages are against v2 with no cap. The eShop rows are the understand runs; its Deepen under the cap was -12.9% and -8.2%.

**What changes (this pull request):**

- `reader/read-more.v2.md` is the current read-more prompt again (RF-206). v3 stays loadable.
- The cap of RF-1414 is off by default: `readMoreLines` is undefined, so an ask opens no budget and `read_file` cuts nothing. With a cap set, the rules of RF-1414 are unchanged.
- The lab's `reader/read-more` target follows the same setting, so it grades with no cut (`cutLines` 0) unless a cap is given.
- The seven options of section 8 stay as the record.

**Proposed follow-up (text only, not filed; nothing in it is built or measured).** Change what follows a cut ask: in the later calls of a task, compact or drop a refused final answer, so an ask added by the cap does not carry the whole refused answer into every later call. Then measure v3 with a cap again on the lab and on the Asset Manager and Invoice journeys.
