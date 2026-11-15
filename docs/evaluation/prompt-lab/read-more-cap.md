# Prompt lab: a line cap per read-more ask (P10-13)

Card P10-13, 2026-11-15, GitHub issue #1390. The owner ruled "Add a line cap" on the P10-11 result (DEC-239): `reader/read-more.v3` was over the +15% per call of DEC-235 (c) on Asset Manager (the call after the reads +25.5%, the last call of an asked task +17%) and within on eShop and Invoice (`end-to-end.md` section 4.1). Spend so far: **$0.4212** of the $1.50 slice, all in the lab (section 6).

**Result: a cap of 350 lines per ask, enforced in code (RF-1414); the prompt stays `read-more.v3`.** After a read-more ask, `read_file` serves at most 350 lines until the reader's next answer: a read past the budget is cut from its start line, and one made with no line left is not run (a notice, not a tool error). The arithmetic on the P10-11 Asset Manager task puts the call after the reads at +6.9% to +11.4% against 2026-11-09 (limit +15%). Drafts that tell the model the budget read fewer new lines than v3 under the same cap, so none is kept. **What the cap costs:** on the lab's held-back cases, where every model reads big areas, v3 under the cap reads no more new lines per turn than v2 under the cap, so the cap gives back the lab gain of v3 (section 4). **Not done yet: the journey check on the `rosetta-p10` stack** (section 5). Docker was not running, so the Asset Manager and Invoice journeys wait for the owner to start it. The cap is kept only provisionally until they run.

Only aggregate figures are written here. The Asset Manager and Invoice runs' files, cards and logs stay outside the repository (owner, 2026-11-14).

## 1. Where the cap lives

| Option                                                                            | For                                                                            | Against                                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| A total line budget in the prompt only (a v4)                                     | no code change                                                                 | the model can ignore it, and in the lab it reads fewer lines when told the budget (section 4)                       |
| **A cap in code: the tool runner cuts `read_file` past N lines per ask (chosen)** | the model cannot exceed it; one constant bounds the later calls on every model | the model is not told and may ask for lines past the cap, which come back as a notice (cheap, inside the same turn) |
| Both                                                                              | the model knows the budget                                                     | every draft that states it read fewer new lines than v3 under the same cap (section 4)                              |

How the code cap works (RF-1414, `read-gate.ts`, `read-budget.ts`, `tool-runner.ts`):

- Each read-more ask gives the task a budget of 350 lines (`readMoreLines`). It lasts until the next final answer, and the next ask starts a new one. The reads before the first ask have no cap.
- Every line `read_file` serves counts, a re-read included, because each one stays in the input of the task's later calls.
- A read that asks for more lines than are left is cut from its start line.
- A read made with no line left is not run. The reader gets one data block that says the lines are spent and asks for the final answer. It is not a tool error.
- `grep`, `codemap_query` and `list_area_files` are not counted or cut.
- The refusal can state the budget through a `{{lines}}` placeholder. `read-more.v3` has none.
- The lab grades a read-more turn with the same cut, in call order. It records `cutLines`, the lines its reads asked for past the cap, and the report prints them.

## 2. The number: why 350

The P10-11 Asset Manager task is the one over the limit (one of its two reader tasks asked three times). Its calls, from the saved runs (aggregates only):

| Ask  | 2026-11-09 (v2): lines served, call after the reads | P10-11 (v3): lines served, call after the reads |
| ---- | --------------------------------------------------- | ----------------------------------------------- |
| 1    | 371, 37,287                                         | 715, 48,442                                     |
| 2    | 195, 51,349                                         | 416, 67,274                                     |
| 3    | 261, 66,457                                         | 57, 78,988                                      |
| Mean | 276, **51,698**                                     | 396, **64,901 (+25.5%)**                        |

**Tokens per served line.** On P10-11 Asset Manager, the call after the reads minus the call that carried the ask, over the lines served: ask 1 16,805 / 715 = 23.5, ask 2 9,735 / 416 = 23.4. So t = 23.5 tokens a line, counting each line's number prefix and the data block's frame. `reader.md` used "about 12 tokens a line", half the real figure. That is one reason its +1.1k estimate per ask was low.

**Limit.** The call after the reads may be at most 51,698 x 1.15 = **59,453** tokens. The last call of the task may be at most 74,748 x 1.15 = **85,960** (P10-11: 87,280).

**Two models of what a cap of N does**, with L = 715, 416, 57:

- **(A) Same reads, cut.** Each ask's reads are cut at N. Ask j's call after the reads falls by t x the sum of (L_i - N) over the asks up to j, where L_i is above N.
- **(B) Fills the cap.** Every ask serves exactly N lines, the worst case: a reader that, once cut, reads the rest of the file at the next ask. Ask j's call falls by t x (the P10-11 lines up to ask j - j x N).

| N       | (A) lines saved by ask 1, 2, 3; mean | (A) call after the reads | (B) lines saved by ask 1, 2, 3; mean | (B) call after the reads | (B) last call         |
| ------- | ------------------------------------ | ------------------------ | ------------------------------------ | ------------------------ | --------------------- |
| 300     | 415, 531, 531; 492.3                 | 53,331 (+3.2%)           | 415, 531, 288; 411.3                 | 55,235 (+6.8%)           | 80,512 (+7.7%)        |
| **350** | **365, 431, 431; 409.0**             | **55,289 (+6.9%)**       | **365, 431, 138; 311.3**             | **57,585 (+11.4%)**      | **84,037 (+12.4%)**   |
| 400     | 315, 331, 331; 325.7                 | 57,248 (+10.7%)          | 315, 331, -12; 211.3                 | 59,935 (+15.9%, over)    | 87,562 (+17.1%, over) |
| 450     | 265, 265, 265; 265.0                 | 58,673 (+13.5%)          | 265, 231, -162; 111.3                | 62,285 (+20.5%, over)    | 91,087 (+21.9%, over) |

Worked line, N = 350, model (B): the mean of 365, 431 and 138 is 311.3 lines. At 23.5 tokens a line that is 7,316 tokens. 64,901 - 7,316 = 57,585, which is +11.4% against 51,698. The last call falls by 138 x 23.5 = 3,243, to 84,037 (+12.4%).

**350 is the largest round N that stays within +15% under the worst-case model, with a margin of 3.6 points.** 400 is over under (B). 300 leaves more margin but sits close to v2's own real reads per ask (Asset Manager 276), so it would give back more of what v3 reads. On the other apps of P10-11 the cap can only lower the figures, which were already within: on eShop each ask read 484 lines on average (v2: 226), on Invoice 429 (v2: 676). Neither model counts a shorter answer after fewer reads. Both hold the rest of the task as it was, which one real run cannot confirm. The journeys of section 5 check it.

## 3. Method

As `reader.md`: the `reader-read-more` set (5 tune and 5 held-back eShopModernizing cases, captured from public code) and the RF-1410 grading of the first tool turn after the refusal, now with the run's cut (RF-1414).

- Every run graded here uses the cap of 350 lines.
- `cutLines` is what the cap removed from that same run's reads, so "new + cut" is close to what the same answers read without the cap: a matched comparison of the cap alone, in one run.
- Keep rules: DEC-231, DEC-235, DEC-237 (no regression on every model measured, matched held-back runs, never pooled) and DEC-238 (a deterministic measure of what the prompt is for, here the new lines, counts as quality).
- Haiku 5.5 first, then one Sonnet 5.5 run. Lab command as in the runbook, through the shared ledger.

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
  - This is the trade DEC-239 asked for, at its far end: on these cases every turn of both prompts is above the cap. In real runs v2 read 226 (eShop) and 276 (Asset Manager) lines per ask, below the cap, and v3 484 and 396. So on real runs the cap still lets an ask read up to 350 lines, more than v2 did.
- **r3, a v4 that states the budget, is not kept.**
  - Against v3 under the same cap it reads fewer new lines on both Haiku pairs (-1.3% and -6.1%) and on tune (-5.9%). That is a regression on the measure the prompt is for (DEC-237, DEC-238), although small.
  - What it gains: no read past the cap (stale 0 against 1.27 and 1.60), output -14% and -24%, cost -5% and -8%.
  - Under the keep rule a version that regresses the quality measure is not kept for lower cost. In a run, the calls v3 makes past the cap only get a short notice inside the same turn.
  - Not run: Sonnet on r3, as r3 was already out on Haiku.

**Keep decision.** The code cap of 350 lines with the prompt `read-more.v3` (no new prompt version). It is a code change, not a prompt version, so the keep rules apply only to the prompt choice (v3 kept, r3 not). The cap itself is DEC-239's ruling. Whether it keeps the later calls within +15% is what the journeys must show.

## 5. Journeys on the rosetta-p10 stack: pending

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
| Asset Manager | lines per ask, mean        | 276             | 396             | pending              |
| Invoice       | call after the reads, mean | 42,598          | 43,497 (+2%)    | pending              |
| Invoice       | lines per ask, mean        | 676             | 429             | pending              |

## 6. Spend

| Part                                      | Runs                      | Cost        |
| ----------------------------------------- | ------------------------- | ----------- |
| Haiku tune: v3 and three drafts           | 4 x 15 calls              | $0.0591     |
| Haiku held-back: two matched pairs and v2 | 5 x 15 calls              | $0.0815     |
| Sonnet held-back: v3                      | 15 calls                  | $0.2805     |
| **Lab total**                             | 10 invocations, 150 calls | **$0.4212** |
| Stack (journeys)                          | not run                   | $0          |

The shared ledger's settled total went from $25.707 to $26.128. No judge was used: RF-1410 makes no judge call on a tool turn. Ollama was not used.

## 7. Choice for the owner

The cap meets the +15% on the arithmetic of section 2 for Asset Manager, and only lowers eShop and Invoice. But in the lab it gives back the gain DEC-238 kept v3 for: on large areas, v3 under the cap reads no more per turn than v2 under it, and less than v2 read without a cap. If the journeys confirm the arithmetic, there are three ways on:

1. **Keep the cap at 350 with v3** (this card's choice): bounded later calls on every model, and real asks may still read up to 350 lines, more than v2's 226 to 276.
2. **Raise the cap to 400:** worst-case model (B) puts Asset Manager at +15.9%, over the limit. Keeps a little more of v3's reads.
3. **Revert to v2 and drop the cap:** the 2026-11-09 figures; no capped turns, and v2 reads about 378 a turn on the lab's large areas but 226 to 276 per ask in real runs.
