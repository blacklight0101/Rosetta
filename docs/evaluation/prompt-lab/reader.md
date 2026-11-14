# Round log: the reader prompts (P10-05)

Status 2026-11-14 (fix round after the verification of #1410): **`reader/read-more.v3.md` is kept; every other reader version stays current.** The first measure of RF-1410 could not fail; it was rewritten to grade what a tool turn gives the run's read gate (section 1), and round 0 was run again on it. `reader/read-more` went through four Haiku rounds and `reader/turns-left` through three; v3 (round 4 of `read-more`) beats v2 on matched held-back runs of Haiku (twice), Sonnet and Opus 5.5 (section 6). **The card's done-when is not met in full:** only `read-more` and `turns-left` had three Haiku rounds or more; the other six wired prompts had round 0 on the new measure and no round (section 5 says why), and `reader/workbook` has no committed set. Spend: **$4.1303 of the $7.00 slice** in all (target calls $2.7559, judge $1.3744); the shared ledger, which includes the other builder's spend, stood at $20.89 after the last run.

Run ids are folders of `lab-out/` (git-ignored) and all have the prefix `20261114-`. No answer text is quoted beyond a few words. Runs before `020252` were scored with the first measure and are superseded; section 8 lists them.

Keep rule: the strict rule is DEC-231 (no regression on any check, no rise in tokens, latency or cost), relaxed by DEC-235 (up to +15% input, output, latency and cost per call each, for a clear quality gain with no regression); DEC-237 says which models the "no regression" covers: every model measured, on the same held-back cases and repetitions, matched runs only, never pooled. A set with no held-back case may be measured but nothing is kept from it (DEC-234). Every committed reader set has held-back cases.

## 1. The measure (settled first, corrected after verification)

The P10-04 baseline could not score a reader first turn: the lab replays one turn, a turn answered with tool calls has no card text, and the judge gave it 1 (finding 3). A tool call was also counted as a failure wherever a set expected an answer (finding 4). The question per prompt was which turn the prompt acts on in a run, and what a run does with that turn.

**Decision: grade the tool-call turn itself for the seven prompts that act on a turn a run answers with tool calls, by what the calls give the run's read gate; keep the final-answer turn, with its tools, for `reader/turns-left`.** The Givens are RF-1410 (spec commits first, red `test:` commits, then the code).

**The first version of this measure could not fail** (verification of #1410, finding 1): one valid call made a turn `ReadsFiles`, so a lone `codemap_query`, a grep with no hit, a replayed range moved by one line or a one-line read of `packages.config` all passed, and the "ceiling" of the first round log was false. The measure now grades what the gate gets:

| Lab measure (RF-1410)                                                                                                                                                                                                                  | What a real run does (`agent-loop.ts`, `ToolRunner`, `read-gate.ts`, `read-share.ts`)                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a path is a readable file when the case lists it and did not skip it, matched exactly or by the one listed file that differs only in letter case                                                                                       | `CodeMapIndex.resolve` resolves a path the same way; `readableAreaEntries` leaves out skipped files                                                                                                                                                                                             |
| `newLines`: lines of readable files read for the first time (after the replayed reads and the earlier calls of the answer), a read cut to the file and to 400 lines                                                                    | the gate adds each read's excerpt; the share counts lines read over each file's lines (Q-50); `scan.excerptMaxLines` defaults to 400 (RF-144)                                                                                                                                                   |
| `areaReads`: `read_file` calls of which more than half of the lines are new; `stale`: half or fewer                                                                                                                                    | a read that adds no line leaves the share where it was; after a read-more refusal, a next answer with no growth is accepted at that coverage (`ReadGate.readMore`)                                                                                                                              |
| `searches`: `grep` and `codemap_query` (not area reads)                                                                                                                                                                                | a code map query gives the gate no line (a symbol query none, a path query only lists statement lines, RF-209); a grep adds the lines it matches, which the lab cannot know without the repository                                                                                              |
| `shareGain`, and for read-more `shareBefore` (the refusal's percent) and whether the share reaches 50%                                                                                                                                 | Q-50: at 50% a run accepts the answer as read enough; the area's tokens are spread over its lines, since a case has no per-file tokens (a proxy)                                                                                                                                                |
| `generatedLines`: new lines in designer, service-reference, resource, project and package files                                                                                                                                        | the share counts them like any other line, but no card describes them (the list is the lab's, not the scan's)                                                                                                                                                                                   |
| `unlisted`, `repeats`, `relists`                                                                                                                                                                                                       | an unlisted read is not counted by the gate (and is a tool error if the file does not exist); a repeat gets RST-1303 and the third ends the task; a relist returns the list the first message holds                                                                                             |
| labels: `Empty`, `Answered`, `BadToolCall`, `NoAreaRead`, `MissesCited` (reread reads no cited file), `GeneratedOnly` (every new line generated while the area has other files), all not usable; `ReadsWithWaste`, `ReadsFiles` usable | an answered first turn is refused (RF-206) and costs a turn; at the read-more turn an immediate answer is **accepted** at the coverage it had (`ReadGate.readMore`, an ask after no new read), which is the outcome the refusal exists to prevent, so the lab counts it as the prompt's failure |
| `reader/turns-left`: the last turn, **with** the reader's tools; `ReadsMore` not usable                                                                                                                                                | a read with one turn left ends the task at the turn limit (RST-1304) with no cards unless a refused answer is kept (Q-55)                                                                                                                                                                       |
| `NoCards` (an empty cards list with no problem): usable only in a case whose `expected` label is `NoCards`; the count of every label is printed and must not rise                                                                      | a run accepts `{"cards": []}` as `final-answer` with no card; a model that gives up on an area with code answers the same and costs less (verification finding 2)                                                                                                                               |

Corrections to the first log:

- **Read-more reason.** The first log said that after the Q-50 refusal a run "asks for more reading" of any answer. That is wrong: an answer given after a refusal with no new read is accepted at the coverage it had (`ReadGate.readMore`, read-gate.ts line 93). The lab still counts an answer at that turn as a failure, because preventing exactly that answer is the refusal's job.
- **No committed case has an `expected` label**, so `NoCards` is not usable anywhere today. The held-back `launchSettings.json` case of `reader-turns-left` was not labelled `NoCards`: an empty answer and one low-confidence config card (what Sonnet and Opus write) are both defensible there, and a label would mark one of them wrong by fiat.
- **No judge on a tool turn** (RF-1410): a run reads no answer from it.
- **`reader/workbook` has no committed set.** Its cases are only in a local set this card may not open. It got no run and no round.

Why not P10-09's forced final answer (one turn left, `tools: []`) for the first seven: at those turns a run wants reads, not an answer (RF-206 refuses one before any read; after a read-more refusal an answer is accepted at low coverage, which is the failure), so a forced answer would reward the opposite of what the prompt is for.

## 2. Priority

The P10-04 shares (estimates; no call log of a real run is reachable outside the stacks this card may not touch): `read-more` 11.3% of a run's cost (40 calls), `turns-left` 9.5% (25), `read-first` 4.6%, `task` 4.4%, `area` 4.3% (20 each), `reread` 3.9% (30), `parent-cards` 2.1% (20), `answers` 1.4% (10). The `area` system prompt is sent in every reader call, so its true share is larger than its first-turn row. Rounds went to `read-more`, then `turns-left`.

## 3. Round 0 on the new measure (Haiku 5.5, every case, 3 repetitions)

Columns: usable and labels; per tool turn the calls, area reads, searches, stale reads, new lines, share gain (points), generated share of the new lines, `aimed` and turns reaching 50%; input / output tokens per call; latency per call; target cost of the run.

**Tune**

| Run      | Prompt          | Usable, labels                   | Calls / area / search / stale | New lines, gain | Generated | Aimed, half | In / out    | Latency | Cost    |
| -------- | --------------- | -------------------------------- | ----------------------------- | --------------- | --------- | ----------- | ----------- | ------- | ------- |
| `020252` | read-more.v2    | 15/15 ReadsFiles 15              | 4.33 / 4.33 / 0 / 0           | 310.5, 22.8     | 0.0%      | 0.93, 7/15  | 10307 / 684 | 2.5 s   | $0.0152 |
| `020656` | turns-left.v2   | 15/15 Valid 15                   | n/a                           | n/a             | n/a       | n/a         | 8904 / 1885 | 7.7 s   | $0.0209 |
| `020417` | reread.v5       | 24/24 ReadsFiles 21, WithWaste 3 | 2.42 / 1.83 / 0.46 / 0        | 91.8, 66.1      | 13.3%     | 1.83        | 7607 / 339  | 1.5 s   | $0.0110 |
| `020741` | read-first.v1   | 12/12 ReadsFiles 12              | 5.75 / 5.50 / 0.25 / 0        | 318.1, 38.9     | 11.6%     | n/a         | 7990 / 743  | 2.7 s   | $0.0085 |
| `020846` | task.v2         | 12/12 ReadsFiles 12              | 6.00 / 5.83 / 0.17 / 0        | 359.8, 35.6     | 8.4%      | n/a         | 7235 / 869  | 3.2 s   | $0.0081 |
| `023157` | area.v12        | 12/12 ReadsFiles 12              | 6.50 / 6.33 / 0.17 / 0        | 383.3, 43.4     | 14.4%     | n/a         | 7235 / 937  | 3.3 s   | $0.0085 |
| `023305` | parent-cards.v2 | 24/24 ReadsFiles 24              | 1.83 / 1.71 / 0.13 / 0        | 123.7, 68.8     | 36.5%     | n/a         | 7082 / 312  | 1.7 s   | $0.0091 |
| `023400` | answers.v2      | 18/18 ReadsFiles 18              | 2.06 / 1.89 / 0.17 / 0        | 148.8, 85.4     | 12.9%     | n/a         | 6869 / 360  | 1.7 s   | $0.0067 |

**Held-back** (the matched bar a candidate must meet)

| Run      | Prompt          | Usable, labels      | Calls / area / search / stale | New lines, gain | Generated | Aimed, half | In / out    | Latency | Cost    |
| -------- | --------------- | ------------------- | ----------------------------- | --------------- | --------- | ----------- | ----------- | ------- | ------- |
| `020336` | read-more.v2    | 15/15 ReadsFiles 15 | 5.07 / 5.07 / 0 / 0           | 381.7, 12.6     | 0.0%      | 0.80, 0/15  | 11025 / 743 | 2.7 s   | $0.0163 |
| `020705` | turns-left.v2   | 0/3 NoCards 3       | n/a                           | n/a             | n/a       | n/a         | 6849 / 257  | 1.9 s   | $0.0010 |
| `020432` | reread.v5       | 6/6 ReadsFiles 6    | 3.00 / 3.00 / 0 / 0           | 209.8, 71.5     | 0.0%      | 3.00        | 7951 / 474  | 2.0 s   | $0.0034 |
| `020805` | read-first.v1   | 12/12 ReadsFiles 12 | 3.00 / 3.00 / 0 / 0           | 141.3, 100.0    | 0.0%      | n/a         | 6628 / 370  | 1.7 s   | $0.0042 |
| `020910` | task.v2         | 12/12 ReadsFiles 12 | 3.00 / 3.00 / 0 / 0           | 141.3, 100.0    | 0.0%      | n/a         | 6201 / 427  | 1.7 s   | $0.0039 |
| `023222` | area.v12        | 12/12 ReadsFiles 12 | 3.00 / 3.00 / 0 / 0           | 141.3, 100.0    | 0.0%      | n/a         | 6202 / 424  | 1.8 s   | $0.0039 |
| `023327` | parent-cards.v2 | 6/6 ReadsFiles 6    | 5.50 / 5.50 / 0 / 0           | 273.8, 11.6     | 54.5%     | n/a         | 8326 / 879  | 3.2 s   | $0.0049 |
| `023427` | answers.v2      | 12/12 ReadsFiles 12 | 2.00 / 1.75 / 0.25 / 0        | 158.0, 56.1     | 26.9%     | n/a         | 6806 / 372  | 2.0 s   | $0.0045 |

What the new measure shows:

- **`read-more` has room on tune and on held-back.** On tune 7 of 15 turns reach 50%; the failing ones are case `...-001` (an area full of designer and service-reference files) and `...-023` (large JSON templates), where Haiku reads a few lines of many files. On held-back no turn reaches 50% (the areas are large), so the measure there is how far the share moves.
- **`read-first`, `task` and `area` held-back are at the ceiling of the new measure**: each held-back area is three small files, read whole in one turn (gain 100 points, no waste). A candidate cannot show a gain there, so under DEC-231/235 none could be kept; on tune they leave 8 to 14% of new lines on generated files.
- **`parent-cards` and `answers` held-back read many generated lines** (54.5% and 26.9%). Read case by case, it is the area: one `parent-cards` held-back area holds only `eShopModernizedMVC.csproj` and `packages.config` (no plain file, so not `GeneratedOnly`), and the WinForms area holds designer files next to helpers. The prompt under test only adds the parent cards or the owner's answers to the first message.
- **`reread`**: the 3 `ReadsWithWaste` turns are one tune case (`...-104`, 3 of 3), a `codemap_query` of a file outside the area that the rejected claim names (`area.v12` allows following a reference out of the area). `aimed` is above 0 on every case (1.83 tune, 3.00 held-back): the turn reads the cited files.
- **`turns-left` held-back is `NoCards` 3 of 3** (the `launchSettings.json` area). No committed case is labelled `NoCards`, so these are not usable, and their count is the bar a candidate must not raise.

`reader/workbook` was not run (no committed set).

## 4. Rounds of `reader/read-more` (Haiku, tune, 15 turns each)

Each round changes one thing; r1 to r3 change v2, r4 changes r1.

| Round | Run      | Change                                                                                                  | Half | New lines, gain | Stale | Out / latency | Result                                                                                        |
| ----- | -------- | ------------------------------------------------------------------------------------------------------- | ---- | --------------- | ----- | ------------- | --------------------------------------------------------------------------------------------- |
| 0     | `020252` | v2                                                                                                      | 7/15 | 310.5, 22.8     | 0     | 684 / 2.5 s   | baseline                                                                                      |
| r1    | `020956` | add "Read each file you choose whole, up to 400 lines a call, not a few lines of it."                   | 9/15 | 429.1, 38.9     | 0     | 695 / 2.5 s   | better; on held-back (`021312`) one turn re-read a file from line 1 (1 stale, ReadsWithWaste) |
| r2    | `021123` | r1 plus "Make all these calls in this one turn."                                                        | 9/15 | 655.5, 51.4     | 0     | 1184 / 4.0 s  | rejected: output +73% and latency +59% over v2, past the +15% of DEC-235                      |
| r3    | `021220` | r1 with "screens" added to the kinds of files to read                                                   | 9/15 | 481.7, 40.8     | 0     | 794 / 3.0 s   | no better than r1, output +16% over v2: dropped                                               |
| r4    | `021416` | r1 plus "in a file you have read part of, start after the lines you already have" (aimed at r1's stale) | 9/15 | 440.7, 40.1     | 0     | 771 / 2.7 s   | candidate                                                                                     |

r4 tune against v2 tune: half 9 against 7 of 15, new lines +41.9%, input +0.4%, output +12.7%, latency +5.2%, cost equal; generated share 1.4% against 0.0%. The two cases still below 50% are `...-001` and `...-023`; their unread list starts with generated or template files (the list order is production code, section 7).

## 5. Rounds of `reader/turns-left` and why the other prompts had none

`turns-left` is at the ceiling of its deterministic check (`Valid` 15 of 15), so its rounds were judged (Opus 5.5 judge, tune, 2 repetitions, 10 turns, about $0.30 a run). Each changes v2 in one place.

| Round | Run      | Change                                                                                                           | Overall | Coverage, card form | Out / latency | Result                                                                                                |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------- | ------- | ------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| 0     | `021740` | v2                                                                                                               | 3.57    | 2.80, 3.50          | 1631 / 6.8 s  | baseline                                                                                              |
| t1    | `021957` | "The final answer covers every file you read: each one has a claim that cites it."                               | 3.65    | 2.90, 3.80          | 2012 / 8.0 s  | rejected: +0.08 is not a clear gain (DEC-235 asks +0.3); output +23%, latency +18%                    |
| t2    | `022854` | "If you answer before you have read the whole area, add an open question that names the files you did not read." | 3.37    | 3.00, 3.70          | 2790 / 11.3 s | rejected: overall and grounding fall, output +71%                                                     |
| t3    | `023108` | "Give it as the cards JSON alone, with no text before or after it."                                              | 3.51    | 2.60, 3.30          | 1494 / 6.4 s  | rejected: output -8%, latency -6%, cost -5%, but coverage and card form fall (DEC-231: no regression) |

All 40 judged turns were `Valid`. The judge's low marks are the replay (two short reads, then one turn left) and the card format (claims that bundle facts), which `turns-left` does not govern; `area.v12` holds the claim rules. No candidate went to held-back (one case, `NoCards` on Haiku).

**The other six prompts had round 0 on the new measure and no round**, so for them the done-when (three Haiku rounds each) is **not met**:

- `read-first`, `task`, `area`: held-back is at the ceiling (section 3), so no version could be kept under DEC-231/235/237 whatever it did on tune; a round would spend money with no possible keep. Their tune turns read 8 to 14% generated lines, which is the target of a later round once a held-back case with a large area exists.
- `reread`, `parent-cards`, `answers`: their instructions act on the final cards, which their sets (no reads) cannot replay; the first turn they can measure reads the cited files (`reread`, aimed 1.83 and 3.00) or what the area holds (`parent-cards`, `answers`).
- `workbook`: no committed set.

## 6. Keep decision

**Kept: `reader/read-more.v3.md` (r4).** Loader `readerPromptNames.readMore`, the run manifest (via `promptVersionsOf`), the prompt-files tests, `docs/architecture.md` and RF-206 (dated change line) are updated; `read-more.v2.md` stays loadable. Every other version stays current: `task.v2`, `area.v12`, `read-first.v1`, `reread.v5`, `answers.v2`, `parent-cards.v2`, `turns-left.v2`, `workbook.v5`.

Matched held-back runs, `reader-read-more` held-back, 5 cases x 3 repetitions on each side (DEC-237):

| Model         | v2 run   | v3 run   | Usable, labels      | Stale, waste | New lines               | Share gain   | Half       | Input | Output | Latency | Cost per call |
| ------------- | -------- | -------- | ------------------- | ------------ | ----------------------- | ------------ | ---------- | ----- | ------ | ------- | ------------- |
| Haiku 5.5 (1) | `020336` | `021509` | 15/15 ReadsFiles 15 | 0 and 0      | 381.7 to 441.5 (+15.7%) | 12.6 to 14.2 | 0/15, 0/15 | +0.5% | +3.0%  | +7.6%   | +1.6%         |
| Haiku 5.5 (2) | `022120` | `022206` | 15/15 ReadsFiles 15 | 0 and 0      | 376.8 to 469.9 (+24.7%) | 12.4 to 14.9 | 0/15, 0/15 | +0.5% | +0.5%  | +2.2%   | +0.7%         |
| Sonnet 5.5    | `022259` | `022346` | 15/15 ReadsFiles 15 | 0 and 0      | 254.4 to 288.1 (+13.2%) | 10.2 to 11.5 | 0/15, 0/15 | +0.4% | +6.5%  | +5.3%   | -3.0%         |
| Opus 5.5      | `022442` | `022538` | 15/15 ReadsFiles 15 | 0 and 0      | 226.2 to 253.7 (+12.2%) | 8.2 to 10.5  | 0/15, 0/15 | +0.4% | +4.8%  | -0.8%   | -3.4%         |

Under the rule:

- **(a) no regression** on every model: usable, labels (`ReadsFiles` 15 of 15 each side, so no `NoAreaRead`, `GeneratedOnly`, `Answered` or `BadToolCall`), stale, unlisted, repeats and relists are equal; no turn reaches 50% on either side. One counted line moved the wrong way: in Haiku run `022206` one turn of case `...-044` read `packages.config:1-45`, so the generated share is 0.6% against 0.0% (45 of 7 048 new lines); that turn also read plain files and the plain new lines rose more than its 45 (466.9 against 376.8 per turn). On tune it is 1.4% against 0.0%; Haiku pair (1) is 0.0% on both sides. Per case, the two `...-036` cases fell on Haiku pair (1) (499 to 473, 486 to 441) and rose or held on pair (2); v2 alone moved 499 to 408 on the same case between `020336` and `022120`, so that spread is run-to-run noise, not the prompt.
- **(b) quality gain**: the deterministic measure of RF-1410 for this turn, the new lines the read gate gets, rises on every model (+12% to +25%) and the share gain with it (+1.3 to +2.5 points), in the same direction on all four pairs.
- **(c) cost**: the largest rise is Haiku latency +7.6%, inside +15%. Under the strict DEC-231 alone (no rise) the Haiku output and latency rises would reject it; the trade is the one DEC-235 allows.
- **Ruling**: (b) rests on reading the list in DEC-235 (b) as examples, since usable is 15 of 15 on both sides. The owner ruled so on 2026-11-14 (DEC-238); read as a closed list, the strict rule of DEC-231 would have kept v2.
- **Cost a replay cannot see**: more lines read make every later call of the same task larger. At about 12 tokens a line, v3 adds about 0.3k (Opus, +27 lines) to 1.1k (Haiku, +93 lines) input tokens to each later call per read-more ask, or +3% to +10% on calls of 11k to 13k tokens; with up to three asks a late Haiku call could come near the +15% of DEC-235 (c). P10-11 checks it on a real run (DEC-238).

Count check: every run planned and ran cases times repetitions (for example `reader-read-more` 5 x 3 = 15 on both sides; `reader-reread` tune 8 x 3 = 24, held-back 2 x 3 = 6; `reader-turns-left` tune 5 x 3 = 15, judged rounds 5 x 2 = 10, held-back 1 x 3 = 3; `reader-parent-cards` tune 8 x 3 = 24, held-back 2 x 3 = 6; `reader-answers` tune 6 x 3 = 18, held-back 4 x 3 = 12). P10-04's Haiku rows were 1 repetition of the tune cases, so its counts are a third of these.

## 7. What is left

- **The other six prompts need their rounds** (section 5): a held-back case with a large area for `read-first`, `task` and `area`, and a replay of the final answer for `answers`, `reread` and `parent-cards` (a capture that keeps the first reads of those Deepen and re-run tasks, as `reader-turns-left` holds them, with a coverage check like P10-09's `Uncovered`).
- **`turns-left` held-back `NoCards`**: Haiku answers `{"cards": []}` on the `launchSettings.json` area, Sonnet and Opus one low-confidence card (`013107`, `013125`, `013142` of the first round). Whether that case should carry an `expected` label is the owner's call; until then its count must not rise.
- **The read-more list order** (production, `readShare`): largest-first puts generated and descriptor files at the top of the refusal; the two tune cases that stay below 50% are those. Ranking behaviour files first is a production change with its own Given and a real run.
- **`cards/card-format` and `NoCards`**: its target still labels a problem-free empty list `Unusable`.
- **The `area` system prompt** (in every reader call) needs a multi-turn replay or the end-to-end check of P10-11.
- **`reader/workbook`** needs a committed set before any round.

## 8. Superseded and free runs

- **First measure (superseded):** round 0 runs `011047` to `012532`, the Sonnet and Opus samples `011736` to `012002`, the `turns-left` held-back runs `012320`, `013107`, `013125`, `013142` and the judged `012121` were scored before the fix; their "ceiling" came from a measure that could not fail. Their target figures (tokens, latency, cost) and the `turns-left` labels stand; their tool-turn labels do not.
- **gemma4 dry runs (Ollama, free):** `010835` (`reader/area.v12`, tune, sample 2): 2 of 2 `Failed`, RST-1507, Ollama was not running; after it was started, `010926` (`reader/read-more.v2`, tune, sample 2): 2 of 2 turns read one file each, about 55 output tokens and 11.7 s a call, scored with the first measure (no new-lines fields). They checked the wiring only; no figure from them is used above.

## 9. Spend

| Part                                                                                 | Target  | Judge   | Total   |
| ------------------------------------------------------------------------------------ | ------- | ------- | ------- |
| First round (superseded measure)                                                     | $0.8162 | $0.1401 | $0.9563 |
| Fix round: round 0, read-more rounds, keep checks on three models, turns-left rounds | $1.9397 | $1.2343 | $3.1740 |
| **Card total (68 runs)**                                                             | $2.7559 | $1.3744 | $4.1303 |

The four Sonnet and Opus held-back runs cost $1.62 together; the judge of the three `turns-left` rounds and their baseline $1.23.
