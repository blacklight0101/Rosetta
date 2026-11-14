# Round log: the reader prompts (P10-05)

Status 2026-11-14: **the reader is now measured honestly, and no version is kept.** The lab records what a reader turn that calls tools does (RF-1410), and the last turn is read as a run reads it. On that measure every wired reader prompt is at the ceiling of its deterministic checks on Haiku 5.5 (all tune and held-back cases, 3 repetitions) and on the Sonnet 5.5 and Opus 5.5 samples. No failing case was left to read, so no round 1 was drafted for any prompt (section 5). Every current version stays current. Spend: **$0.9563 of the $7.00 slice** (target calls $0.8162, one judged run $0.1401). The shared ledger stood at $17.00 after the last run; that total includes the other builder's spend.

Run ids are folders of `lab-out/` (git-ignored) and all have the prefix `20261114-`. No answer text is quoted beyond a few words.

Keep rule: DEC-231, relaxed by DEC-235, and the orchestrator's ruling recorded as DEC-237: "no regression" holds on every model measured, on the same held-back cases and repetitions, comparing matched runs only and never pooling sample runs. A set with no held-back case may be measured but nothing is kept from it (DEC-234). Every reader set has held-back cases; `reader/workbook` has no committed set.

## 1. The measure (settled first)

The P10-04 baseline could not score a reader first turn: the lab replays one turn, a turn answered with tool calls has no card text, and the judge gave it 1 (finding 3). A tool call was also counted as a failure wherever a set expected an answer (finding 4). The question per prompt was which turn the prompt acts on in a run, and what a run does with that turn.

**Decision: score the tool-call turn itself for the seven prompts that act on a turn a run answers with tool calls; keep the final-answer turn, with its tools, for `reader/turns-left`.** The Givens are RF-1410 (spec commit first, red `test:` commits, then the code). Each lab measure is matched to what a real run does:

| Prompt                                                   | Turn the lab measures                                        | Lab measure                                                                                                                                                                | What a real run does with that turn (`agent-loop.ts`)                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reader/task`, `reader/area`                             | first turn                                                   | RF-1410 tool turn: `ReadsFiles`, `ReadsWithWaste`, `NoAreaRead`, `BadToolCall`, `Answered`, `Empty`, and the counts `calls`, `areaReads`, `unlisted`, `repeats`, `relists` | runs each call (`ToolRunner`); an answer before any read is refused (RF-206), so an answered first turn costs a turn                                                                                                                                                   |
| `reader/read-first`                                      | the turn after the refusal of a premature answer             | the same                                                                                                                                                                   | the refused answer stands only if the task ends first (Q-55); a read is what the refusal asks for                                                                                                                                                                      |
| `reader/read-more`                                       | the turn after the Q-50 refusal                              | the same, plus `aimed` (reads of the files the refusal lists)                                                                                                              | asks again up to three times while the read share grows; a repeat of a replayed read is answered with RST-1303 without running, and the third repeat ends the task                                                                                                     |
| `reader/answers`, `reader/reread`, `reader/parent-cards` | first turn of a re-run or Deepen task                        | the same; `reader/reread` adds `aimed` (reads of the files a rejected claim cites)                                                                                         | runs the calls; a rejected claim is answered only by reading its lines again (RF-209)                                                                                                                                                                                  |
| `reader/turns-left`                                      | the last turn ("Turns left: 1"), **with** the reader's tools | card parser: `Valid`, `Partial`, `NoCards`, `Unusable`, `ReadsMore`                                                                                                        | a tool call there ends the task at the turn limit (RST-1304) with no cards unless a refused answer is kept, so `ReadsMore` is a real loss and stays unusable; `{"cards": []}` with no problem ends the task `final-answer` with no card, so it is `NoCards` and usable |
| `reader/workbook`                                        | the last turn                                                | as turns-left                                                                                                                                                              | no committed set (below)                                                                                                                                                                                                                                               |

Why not P10-09's final-answer turn (one turn left, `tools: []`) for the first seven: at those turns a run never wants an answer. The read gate refuses an answer before any read and, after the Q-50 refusal, asks for more reading, so forcing an answer there would reward the opposite of what the prompt is for and what the run does. For `reader/turns-left` the P10-09 device would hide the one failure the prompt exists to prevent (reading on the last turn), so its tools stay. This is the lesson of P10-09: the lab must not reward a behaviour that loses output in a run.

Other parts of the measure:

- **No judge on a tool turn** (RF-1410): a run reads no answer from it. The judge would score an answer that does not exist; this removes finding 3's artefact and its cost.
- **`unlisted` is a proxy.** The lab knows the case's file list, not the repository. A read outside the list is wasted if the path does not exist (a tool error) and uncounted by the read gate if it does; `area.v12` allows following a reference out of the area, so an unlisted call is counted as waste but does not make a turn unusable unless no call works on the area.
- **`aimed` is a proxy and turned out not to measure quality** (section 4).
- **When fewer output tokens are claimed on a tool turn, `areaReads` per turn must not fall**: a turn that reads less is not cheaper in a run, the reads move to a later turn.
- **`NoCards` came from a held-back case.** The held-back case of `reader-turns-left` (an area of one `launchSettings.json`) was `Unusable` 3 of 3 on Haiku with `{"cards": []}` (run `012320`). A run accepts that answer, so the label was wrong, not the prompt. The fix is a measure change with its own Given (RF-1410) and red test, and the case was not tuned on. `cards/card-format` (P10-09's target) still labels an empty list `Unusable`; that is left to its owner.
- **`reader/workbook` has no committed set.** Its cases are only in a local set built from the Asset Manager and Invoice Generator runs, which this card may not open. It got no run and no round.

## 2. Priority

The P10-04 shares (estimates; no call log of a real run is reachable outside the stacks this card may not touch): `read-more` 11.3% of a run's cost (40 calls), `turns-left` 9.5% (25), `read-first` 4.6%, `task` 4.4%, `area` 4.3% (20 each), `reread` 3.9% (30), `parent-cards` 2.1% (20), `answers` 1.4% (10). The `area` system prompt is sent in every reader call, so its true share is larger than its first-turn row. The runs below went in that order.

## 3. Round 0: the current versions on the honest measure

Columns: run; prompt; model; selection and repetitions; usable; labels; tool turn calls / area reads per turn / wasted calls in all; input / output tokens per call; latency per call; target cost.

**Haiku 5.5, tune, every case, 3 repetitions**

| Run      | Prompt          | Usable | Labels                          | Calls / area / waste | Tokens in / out | Latency | Cost    |
| -------- | --------------- | ------ | ------------------------------- | -------------------- | --------------- | ------- | ------- |
| `011047` | read-more.v2    | 15/15  | ReadsFiles 15                   | 4.67 / 4.67 / 0      | 10305 / 712     | 2.7 s   | $0.0154 |
| `011243` | turns-left.v2   | 15/15  | Valid 15                        | n/a                  | 8904 / 1492     | 6.1 s   | $0.0179 |
| `011324` | reread.v5       | 24/24  | ReadsFiles 21, ReadsWithWaste 3 | 2.38 / 2.25 / 3      | 7609 / 324      | 1.6 s   | $0.0108 |
| `011415` | read-first.v1   | 12/12  | ReadsFiles 12                   | 5.75 / 5.75 / 0      | 7994 / 761      | 2.7 s   | $0.0086 |
| `011457` | task.v2         | 12/12  | ReadsFiles 12                   | 6.33 / 6.33 / 0      | 7235 / 908      | 3.2 s   | $0.0083 |
| `011539` | area.v12        | 12/12  | ReadsFiles 12                   | 6.42 / 6.42 / 0      | 7233 / 929      | 3.2 s   | $0.0085 |
| `011622` | parent-cards.v2 | 24/24  | ReadsFiles 24                   | 1.88 / 1.88 / 0      | 7083 / 300      | 1.5 s   | $0.0089 |
| `011655` | answers.v2      | 18/18  | ReadsFiles 18                   | 2.06 / 2.06 / 0      | 6870 / 354      | 1.6 s   | $0.0067 |

**Haiku 5.5, held-back, every case, 3 repetitions** (the matched figures a later candidate must meet)

| Run      | Prompt          | Usable | Labels        | Calls / area / waste | Tokens in / out | Latency | Cost    |
| -------- | --------------- | ------ | ------------- | -------------------- | --------------- | ------- | ------- |
| `012311` | read-more.v2    | 15/15  | ReadsFiles 15 | 5.27 / 5.27 / 0      | 11025 / 762     | 2.8 s   | $0.0164 |
| `013107` | turns-left.v2   | 3/3    | NoCards 3     | n/a                  | 6856 / 184      | 1.6 s   | $0.0009 |
| `012334` | reread.v5       | 6/6    | ReadsFiles 6  | 3.00 / 3.00 / 0      | 7955 / 461      | 1.9 s   | $0.0034 |
| `012355` | read-first.v1   | 12/12  | ReadsFiles 12 | 3.00 / 3.00 / 0      | 6631 / 370      | 1.5 s   | $0.0042 |
| `012422` | task.v2         | 12/12  | ReadsFiles 12 | 3.00 / 3.00 / 0      | 6201 / 459      | 2.0 s   | $0.0041 |
| `012447` | area.v12        | 12/12  | ReadsFiles 12 | 3.00 / 3.00 / 0      | 6202 / 408      | 1.8 s   | $0.0038 |
| `012507` | parent-cards.v2 | 6/6    | ReadsFiles 6  | 4.83 / 4.83 / 0      | 8325 / 772      | 2.9 s   | $0.0046 |
| `012532` | answers.v2      | 12/12  | ReadsFiles 12 | 1.92 / 1.92 / 0      | 6807 / 364      | 1.8 s   | $0.0044 |

`012320` is the same turns-left held-back run before the `NoCards` fix (3 `Unusable`, the same answers); it is superseded by `013107`.

**Sonnet 5.5 and Opus 5.5, tune, `--sample 2`, 1 repetition** (indicative; 2 calls each)

| Prompt          | Sonnet run | Sonnet usable, calls / area / waste | Opus run | Opus usable, calls / area / waste |
| --------------- | ---------- | ----------------------------------- | -------- | --------------------------------- |
| read-more.v2    | `011736`   | 2/2, 2.50 / 2.50 / 0                | `011845` | 2/2, 2.00 / 2.00 / 0              |
| turns-left.v2   | `011750`   | 2/2 Valid                           | `011907` | 2/2 Valid                         |
| reread.v5       | `011758`   | 2/2, 3.00 / 3.00 / 0                | `011917` | 2/2, 3.00 / 3.00 / 0              |
| read-first.v1   | `011804`   | 2/2, 2.00 / 2.00 / 0                | `011927` | 2/2, 3.00 / 3.00 / 0              |
| task.v2         | `011811`   | 2/2, 2.00 / 2.00 / 0                | `011936` | 2/2, 3.00 / 3.00 / 0              |
| area.v12        | `011818`   | 2/2, 2.00 / 2.00 / 0                | `011946` | 2/2, 3.00 / 3.00 / 0              |
| parent-cards.v2 | `011825`   | 2/2, 1.50 / 1.50 / 0                | `011954` | 2/2, 1.50 / 1.50 / 0              |
| answers.v2      | `011832`   | 2/2, 1.50 / 1.50 / 0                | `012002` | 2/2, 1.50 / 1.50 / 0              |

`reader/turns-left`, held-back, 3 repetitions on all three models (matched): Haiku `013107` NoCards 3 of 3 (output 184 tokens, 1.6 s); Sonnet `013125` Valid 3 of 3 (606, 4.7 s); Opus `013142` Valid 3 of 3 (516, 4.8 s). Sonnet and Opus write one low-confidence card about the launch settings; Haiku writes none. Both are answers a run accepts.

**Judge, once** (`012121`, `reader/turns-left`, Haiku, tune, 5 cases, Opus judge, $0.1401): mean overall 3.7; coverage 2 to 3 on every case, card-form 3 to 4, grounding 4 to 5, evidence-quality 4 to 5. The coverage reasons are mostly the replay ("only two of 59 files were partly read"): the case replays two short reads and then says one turn is left, so the judge marks down what the lab withheld. The reader judge is trusted only with care (`judge-sample.md`), and this run gave no deterministic failure to act on.

## 4. What the cases show

- **No tool turn wasted a call on Haiku except 3 of 24 `reader/reread` turns**, all on one case (`...195943-understand-reader-104`, 3 of 3): a `codemap_query` of a file outside the area, which the rejected claim names. `area.v12` allows following a reference out of the area, so this is the proxy's limit, not a fault of the prompt. No repeat, no relist, no bad call, no answered or empty first turn on any model.
- **`aimed` does not measure quality for `reader/read-more`.** Haiku read none of the listed files on 8 of 15 tune turns and 7 of 15 held-back turns. On those cases the refusal's list starts with the largest unread files, which are generated or descriptor files (`*.Designer.cs`, service references, `.wsdl`, `.csproj`), and the model reads the rest of the behaviour files it had started instead. Its read share grows either way (Q-50 counts lines not yet read in any first-party file). The list order is production code (`readShare`: formulas, macros, then largest first), not the prompt; see section 7.
- **Haiku reads more per first turn than the larger models**: about 6 files on the tune cases of `task`, `area` and `read-first` (output 760 to 930 tokens) against 2 to 3 for Sonnet and Opus. In a run, parallel reads save turns; fewer reads per turn is not a gain under the rule of section 1.
- **`reader/turns-left` is at its job on every model:** 15 of 15 and 5 of 5 tune turns `Valid` on Haiku, 2 of 2 on each sample, and no `ReadsMore` anywhere. The P10-04 `Partial` (1 of 5) did not recur in 20 Haiku tune turns.

## 5. Rounds

| Prompt         | Share                            | Round 0 (Haiku tune / held-back usable) | Rounds after 0 | Why                                                                                                                                                                                                             |
| -------------- | -------------------------------- | --------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read-more`    | 11.3%                            | 15/15, 15/15                            | none           | no failing case; no waste; `aimed` is not a quality signal (section 4). The one wording question found (the last sentence states the RF-210 ask-again rule, added by P8-92) is a design decision, not a defect. |
| `turns-left`   | 9.5%                             | 15/15, 3/3                              | none           | no `ReadsMore` and no unusable answer on any model; the judge's weak criteria come from the replay and belong to the card format, not to a per-turn timing message that every reader call carries.              |
| `read-first`   | 4.6%                             | 12/12, 12/12                            | none           | no failing case                                                                                                                                                                                                 |
| `task`         | 4.4%                             | 12/12, 12/12                            | none           | no failing case; 271 bytes, nothing to cut                                                                                                                                                                      |
| `area`         | 4.3% (sent in every reader call) | 12/12, 12/12                            | none           | no failing case on the first turn; its rules act on the final cards, which the area target cannot replay, so a cut here could not be measured honestly                                                          |
| `reread`       | 3.9%                             | 24/24, 6/6                              | none           | no failing case; its effect is in the final answer, which the set (no reads) cannot replay                                                                                                                      |
| `parent-cards` | 2.1%                             | 24/24, 6/6                              | none           | as reread                                                                                                                                                                                                       |
| `answers`      | 1.4%                             | 18/18, 12/12                            | none           | as reread                                                                                                                                                                                                       |
| `workbook`     | -                                | not run                                 | none           | no committed set (section 1)                                                                                                                                                                                    |

The method is "read the failing cases, change one thing". With no failing case there is nothing to read, and a draft written without one would be tuning blind, the situation P10-09 declined for `cards/card-format`. An efficiency-only draft (shorter wording, same behaviour) was considered for `read-more` and `reread` and not run: their texts are small next to the 7 000 to 11 000 tokens of a call (a cut of 50 tokens is under 1% of input), while latency and output of the same text vary by more than 10% between runs (P10-10 section 2b), so under DEC-237 such a draft would fail on noise; the money was left in the reserve.

## 6. Keep decision

**Nothing is kept; no candidate was produced.** Every current version stays current: `task.v2`, `area.v12`, `read-first.v1`, `read-more.v2`, `reread.v5`, `answers.v2`, `parent-cards.v2`, `turns-left.v2`, `workbook.v5`. No prompt file, loader, manifest or `prompt-files` test changes. The matched held-back figures of section 3 are the bar a later candidate must meet on each model it is measured on.

Count check: every run planned and ran cases times repetitions (for example `reader-reread` tune 8 cases x 3 = 24, held-back 2 x 3 = 6; `reader-read-more` 5 x 3 = 15 on both sides; `reader-turns-left` 5 x 3 = 15 tune and 1 x 3 = 3 held-back). P10-04's Haiku rows were 1 repetition of the tune cases (for example `reader/answers` 6), so its counts are a third of these.

## 7. What is left

- **Replay the final answer of `reader/answers`, `reader/reread` and `reader/parent-cards`.** Their sets hold no reads, so only the first turn can be measured, while their instructions act on the cards. A capture that keeps the first reads of those Deepen and re-run tasks (as `reader-turns-left` holds them) would let a last-turn target with a coverage check (P10-09's `Uncovered`) measure them.
- **The read-more list order** (production, `readShare`): largest-first puts generated and descriptor files at the top of the refusal. A rank that puts behaviour files first would be a production change with its own Given and a real run.
- **`cards/card-format` and `NoCards`:** the card-format target still labels a problem-free empty list `Unusable`, which a run accepts; the same one-line fix as RF-1410 would make it match.
- **The `area` system prompt** is the largest token lever of the family (in every reader call). Measuring a change to it needs a multi-turn replay or the end-to-end check of P10-11; the one-turn lab cannot see what a cut does to the cards.
- **`reader/workbook`** needs a committed set before any round.
