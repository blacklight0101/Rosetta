# Prompt lab: a line cap per read-more ask (P10-13)

Card P10-13, 2026-11-15, GitHub issue #1390. The owner ruled "Add a line cap" on the P10-11 result (DEC-239): `reader/read-more.v3` was over the +15% per call of DEC-235 (c) on Asset Manager (the call after the reads +25.5%, the last call of an asked task +17%) and within on eShop and Invoice (`end-to-end.md` section 4.1). Spend so far: **$0.4212** of the $1.50 slice, all in the lab (section 6).

**Result: a cap of 350 lines per ask, enforced in code (RF-1414); the prompt stays `read-more.v3`.** After a read-more ask, `read_file` serves at most 350 lines until the reader's next answer: a read past the budget is cut from its start line, and one made with no line left is not run (a notice, not a tool error). The arithmetic on the P10-11 Asset Manager task puts the call after the reads at +8.8% to +13.2% against 2026-11-09 (limit +15%). The +13.2% worst case has 1.8 points of margin and depends on how many tokens a line costs (section 2). Drafts that tell the model the budget read fewer new lines than v3 under the same cap, so none is kept. **What the cap costs:** on the lab's held-back cases, where every model reads big areas, v3 under the cap reads no more new lines per turn than v2 under the cap, so the cap gives back the lab gain of v3 (section 4). **Not done yet: the journey check on the `rosetta-p10` stack** (section 6). Docker was not running, so the Asset Manager and Invoice journeys wait for the owner to start it. The cap is kept only provisionally until they run.

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

Neither model counts a shorter answer after fewer reads. Both assume the rest of the task stays as it was, which one real run cannot confirm. The journeys of section 6 will check it, and section 8 sets out the choice of N for the owner.

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

**Keep decision.** The code cap of 350 lines with the prompt `read-more.v3` (no new prompt version). It is a code change, not a prompt version, so the keep rules apply only to the prompt choice (v3 kept, r3 not). The cap itself is DEC-239's ruling. Whether it keeps the later calls within +15% is what the journeys must show.

## 5. What the lab does not see

The lab grades one tool turn after one ask (RF-1410, RF-1414). A defect that only shows at a second ask cannot show there. The repeat defect of the fix round was one: the first version of the cap passed every lab round with it.

The tool runner's tests now cover two asks (`tool-runner-budget-asks.test.ts`). No test yet runs a reader through several asks end to end.

**Proposed follow-up card (text only, not filed): "Replay a reader task across read-more asks".** Difficulty 6, size S, depends on P10-13.

- Add an integration test of the agent loop with recorded responses (ADR-008). It runs one reader task through three read-more asks with the cap: a read refused at the first ask, the same read made again after the second, then a final answer.
- The test checks that the task ends with its cards rather than RST-1303, and records the lines served per ask.
- If it is worth the cost, also add a lab case type that replays two asks (the reads of the first ask, the refusal, a second ask), so that a prompt's behaviour at the second ask can be graded too.

## 6. Journeys on the rosetta-p10 stack: pending

**Not run.** Docker Desktop was not running when this card reached the step (`docker ps`: the engine pipe is missing), and the card may not start it. The step stays open:

- Rebuild `rosetta-p10` (127.0.0.1:18098) from this branch.
- Run Asset Manager (approved at $4.00, as on 2026-11-09) and Invoice Generator end to end on Haiku, with the estimates and approvals of P10-11.
- Report the read-more figures per app against 2026-11-09 and P10-11: the call after the reads, the last call of an asked task, the mean reader call, and lines per ask.
- Leave the stack running on the branch's build.
- eShop is not planned: the lab shows no harm the cap could do there beyond the fewer lines per ask it is meant to cause, and its P10-11 figures were within the limit already.

| App           | Measure                    | 2026-11-09 (v2) | P10-11 (v3)     | P10-13 (v3, cap 350) |
| ------------- | -------------------------- | --------------- | --------------- | -------------------- |
| Asset Manager | call after the reads, mean | 51,698          | 64,901 (+25.5%) | pending              |
| Asset Manager | last call of an asked task | 74,748          | 87,280 (+17%)   | pending              |
| Asset Manager | lines per ask, mean        | 264             | 383             | pending              |
| Invoice       | call after the reads, mean | 42,598          | 43,497 (+2%)    | pending              |
| Invoice       | lines per ask, mean        | 664             | 417             | pending              |

## 7. Spend

| Part                                      | Runs                      | Cost        |
| ----------------------------------------- | ------------------------- | ----------- |
| Haiku tune: v3 and three drafts           | 4 x 15 calls              | $0.0591     |
| Haiku held-back: two matched pairs and v2 | 5 x 15 calls              | $0.0815     |
| Sonnet held-back: v3                      | 15 calls                  | $0.2805     |
| **Lab total**                             | 10 invocations, 150 calls | **$0.4212** |
| Stack (journeys)                          | not run                   | $0          |

The shared ledger's settled total went from $25.707 to $26.128. No judge was used: RF-1410 makes no judge call on a tool turn. Ollama was not used. The fix round made no model call.

## 8. Choice for the owner

What the evidence says, whatever the choice:

- **Later calls.** On the P10-11 Asset Manager task, against 2026-11-09:
  - a cap of 350 puts the call after the reads at +8.8% (same reads, cut) to +13.2% (every ask fills the cap); the worst case goes over +15% if the lines kept cost 25 tokens each instead of 22.5;
  - 300 gives +5.1% to +8.8%, or +11.8% at 25 tokens a line;
  - 400 is over in the worst case (+17.5%);
  - none of this has been measured on a real run yet (section 6).
- **Lines read in real runs.** A cap of 350 would have cut:
  - under v3: 2 of 3 Asset Manager asks, the one Invoice ask, and on eShop about half the asks (11 of 21 in the understand, 5 of 12 in the Deepen);
  - under v2: 1 of 3 Asset Manager asks, the Invoice ask (664 lines), and few eShop asks (2 of 23, 3 of 17).
- **Lines read in the lab.** On the held-back cases, v3 and v2 under a cap of 350 read the same new lines per turn (about 300). Without a cap, v2 read about 378 and v3 469 to 523. On Sonnet the cap hardly binds.
- **The prompt.** A prompt that states the budget (r3) reads 1% to 6% fewer new lines than v3 under the same cap. It makes no call past the cap and produces 14% to 24% less output.

The options:

1. **Cap of 350 with v3**, as this branch has it. Later calls are bounded on every model and within +15% under both models at 22.5 tokens a line. The cap cuts below v2 on Invoice and on some Asset Manager asks, and v3's lab gain goes on large areas.
2. **Cap of 300 with v3.** The worst case stays within +15% even at 25 tokens a line. It cuts more asks of both prompts on every app, further below v2's reads in the lab.
3. **Cap of 400 with v3.** It keeps more of v3's reads but is over +15% in the worst case.
4. **Revert to v2 with no cap.** The figures go back to those of 2026-11-09. v2's own asks went above 350 on Invoice and on some Asset Manager and eShop asks.
5. **Any cap, with r3 in place of v3.** Less output and no calls past the cap, for 1% to 6% fewer new lines per turn.

The journeys of section 6 are the evidence still missing for options 1 to 3. The cap is one constant (`readMoreLines`), so changing N is a one-line change plus a regrade of the lab runs.
