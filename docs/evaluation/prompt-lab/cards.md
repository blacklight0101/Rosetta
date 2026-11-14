# Round log: the card prompts (P10-09)

Status 2026-11-14: **no version kept; `cards/continue.v1` stays current.** The first round kept `continue.v2`; the verifier found that it dropped cards in a real run and that Sonnet regressed, and section 7 records the fix round (a coverage measure in the lab, candidates without the stop rule, none holding on Sonnet under the strict reading). The other three prompts sit at the ceiling of the lab's deterministic checks, and `cards/card-format` has a small first-try gap that the lab cannot read yet. Sections 3 and 4 are the first round as it was run; read them with section 7. Haiku 5.5 ran every round and no judge call was made (cards judge is advisory). Run ids are folders of `lab-out/`, prefix `20261113-` unless a run id starts with `2026111`. Spend: **$3.66 of the $4.50 slice**.

Keep rule: DEC-231, then DEC-235. On the held-back cases a version is kept when (a) there is no regression on first-try validity, repairs, unusable answers, refusals, RST codes, label agreement or any veto; (b) a deterministic measure improves (fewer unusable or repaired answers, or higher label agreement), because the cards judge is advisory; (c) input tokens, output tokens, latency and cost per call each rise by at most 15%. Latency was measured with 3 repetitions.

## 1. The measure (settled first)

**Decision: the card targets test the final-answer turn.** `cards/card-format`, `cards/flows` and `cards/screens` replay the reads and end with the turns-left message of one turn left, whatever `turns` the case holds, and send **no tools**, so the call must be the answer. This is what the P10-10 builder did for `shared/masked-value` (RF-1406). A real run keeps its tools on the last turn (`src/application/agent/agent-loop.ts`, `send` passes `tools.definitions` on every call; the turn limit is a message, not a tool removal), so a real model may still ask to read more there; the lab drops the tools on purpose, because it measures what the prompt writes and not the model's next move. Counting `ReadsMore` separately (neither usable nor unusable) was the other option; it was not chosen because it leaves a different set of cases for each model and each version, so a rate over a mix cannot be compared. The decision is stated in RF-1406 and in the runbook (section 4, "The card prompts").

Effect on the baseline (Haiku, `--split tune`, current versions, run `222858` for continue before the cut change is not used): flows 8 of 8 valid (`223102`; the P10-04 figure was 6 of 8 with 2 `ReadsMore`), screens 7 of 7 (`223153`; was 6 of 7), card-format 5 of 5 (`223231`). Sonnet and Opus, sample 2 of the tune cases, all valid on the three sets (flows `230517`, `230539`; screens `230603`, `230617`; card-format `230655`, `230713`); in P10-04 Sonnet had 4 of 4 and Opus 2 of 2 "reads more" on flows. `ReadsMore` no longer occurs in these sets.

`cards/repair` is P10-07's and still sends the tools.

## 2. `cards/continue`: what was at fault

The P10-04 baseline (Haiku, 3 of 5 unusable) read the same three ways, so the three suspects were checked in turn.

1. **The cut point.** The lab's cut answer was `{"cards": [{"type": "BR", "title": "`, an answer cut at its first token, which leaves the model nothing to continue. Haiku wrote three different slips on it: a stray opening quote, a raw line break inside the string, and a line of prose and a code fence before the JSON. A first try with an invented late-fee card cut inside a claim was worse: models refused to finish a card about code they had not read ("I can't continue that answer ... cites src/Billing/Invoices.cs, which I never opened"), and the parser still said `Valid` because it dug a fresh answer out of the prose. So the cut is now made from the case's first read (the start of a `FEAT` card about that file, with its path and lines, cut inside its first claim; never a model's answer), and a joined answer whose first card is not the cut card finished is `Restarted`, not usable and not valid on the first try. Both changes have their Givens in RF-1406 and red tests first. (A variant with a `BR` card about "settings" was tried and not better: `224739` v1 1 of 10, `224857` first draft 2 of 10; reverted.)
2. **The join.** `joinFragment` strips a code fence only at the very start. The slips above (prose before a fence) fall outside that, and a raw line break inside a string cannot be repaired by a join without guessing. It was not changed: the fix belongs in the prompt, and a production change would need its own RF Given and a real run to show it matters.
3. **The prompt.** On the new cut `continue.v1` still fails on Haiku: 1 of 10 valid on tune (`224443`), 1 of 9 on held-back (`225236`), mostly `Restarted`: the model decides the cut card is wrong and writes a new answer. The prompt is at fault as well as the cut, and the rounds below are on it.

Baseline of the settled measure, Haiku, `--split tune`, 5 cases x 2 repetitions: **`continue.v1`: valid on the first try 1 of 10, unusable 9** (`224443`; input 9057, output 1505 tokens per call, 6.6 s).

## 3. Rounds on `cards/continue` (Haiku, tune, 5 cases x 2 repetitions; each draft is the previous one plus one change)

| Round | Change                                                                                                      | Run      | Valid first try | Unusable | Output tokens | Latency | Decision  |
| ----- | ----------------------------------------------------------------------------------------------------------- | -------- | --------------- | -------- | ------------- | ------- | --------- |
| 0     | `continue.v1`                                                                                               | `224443` | 1 of 10         | 9        | 1505          | 6.6 s   | baseline  |
| 1     | the earlier text is kept as it is: no correcting, no new start, no prose, no fence, no line before the JSON | `224546` | 5 of 10         | 5        | 1128          | 5.5 s   | go on     |
| 2     | a string that was cut goes on inside it, with no new opening quote                                          | `225026` | 5 of 10         | 5        | 1231          | 5.9 s   | go on     |
| 3     | finish the card you were writing, then the list, then stop                                                  | `225101` | 7 of 10         | 3        | 472           | 3.0 s   | go on     |
| 4     | close every string, list and object that is still open, in order                                            | `225150` | 8 of 10         | 2        | 551           | 3.3 s   | go on     |
| 5     | the string rule also says no line break and closes the string with a quote; "no line before" dropped        | `225537` | 9 of 10         | 1        | 584           | 3.7 s   | go on     |
| 6     | "your reply is pasted straight after the last character of the earlier text"                                | `230439` | 9 of 10         | 1        | 536           | 3.2 s   | candidate |

What the failing answers showed, round by round: round 0 restarts (`Restarted`: a fresh answer, often after "I can't continue ..." and a fence); round 1 fixed most restarts but left a stray opening quote and a bracket in the wrong place (`"]` for `",`); round 3 cut the invented extra cards (output tokens 1128 to 472); round 4 and 5 removed the bracket slips. **Sonnet** was checked with every candidate because it is where a one-line rule can hurt: on round 1 it started two answers with a line break (`225821`, 3 of 5), on round 4 it left the string open or started with a line break (held-back sample 2: `225359` 0 of 2; v1 was 2 of 2), on round 5 one answer of 9 (`230007`). Round 5 and 6 added the line-break and quote wording for that. Opus was never affected.

## 4. Held-back decision for `cards/continue` (first round; superseded by section 7)

Held-back cases: 3 (`eshop-20261109-054942-understand-reader-005`, `...063857-understand-reader-191`, `...20261029-152308-understand-reader-036`), Haiku with 3 repetitions (9 runs), `--compare 225236 230052`.

| Version                     | Run      | Valid first try | Repaired | Unusable | Refused / RST | Input tokens | Output tokens | Latency       | Cost per call   |
| --------------------------- | -------- | --------------- | -------- | -------- | ------------- | ------------ | ------------- | ------------- | --------------- |
| `continue.v1`               | `225236` | 1 of 9          | 0        | 8        | 0 / none      | 8389         | 781           | 4.10 s        | $0.00078        |
| round 4 (not kept)          | `225319` | 7 of 9          | 0        | 2        | 0 / none      | 8544         | 678           | 4.16 s        | $0.00074        |
| round 5 (not kept)          | `225639` | 5 of 9          | 0        | 4        | 0 / none      | 8556         | 737           | 4.24 s        | $0.00078        |
| **round 6 = `continue.v2`** | `230052` | **7 of 9**      | 0        | **2**    | 0 / none      | 8578 (+2.3%) | 555 (-29%)    | 3.45 s (-16%) | $0.00069 (-11%) |

The repetitions of one case are not independent (the same input three times), so the 9 runs are 3 cases; the gain is on every case (`eshop-...-005`: 0 of 3 to 3 of 3; `...-036`: 1 of 3 to 2 of 3; `...-191`: 0 of 3 to 2 of 3 on round 4, 3 of 3 on round 5). Read against DEC-235: (a) first-try validity, repairs (0), refusals (0), RST codes (none) do not regress, labels and vetoes do not apply to this set; (b) **unusable answers fall from 8 of 9 to 2 of 9**, a deterministic gain; (c) input +2.3%, output -29%, latency -16%, cost -11%, all inside +15%. **Kept in the first round: `continue.v2` (reversed in section 7).**

Checked on the other two models (held-back):

| Model  | `continue.v1`                                          | `continue.v2`                                                           | Note                                                                                                        |
| ------ | ------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Sonnet | 29 of 29 valid (`225349`, `225944`, `230256`; 3 cases) | 26 of 27 valid (`230118`, `230336`); one answer began with a line break | output 454 to 118 tokens (-74%), latency 4.6 to 1.9 s (-59%), cost per call $0.0116 to $0.0088; input +2.3% |
| Opus   | 2 of 2 (`225416`, sample 2)                            | 4 of 4 (`230356`, sample 2, 2 repetitions)                              | output 670 to 160 tokens, latency 6.3 to 2.7 s                                                              |

**One open point to the verifier:** on Sonnet the kept version has 1 unusable answer in 27 held-back runs against 0 in 29 for v1 (a raw line break at the start of the fragment, which `joinFragment` does not strip). That is not a significant difference at this size, but it is not "no regression" in the strict sense; it is reported, not hidden. The Haiku gain is 8 unusable fewer in 9, and a real continuation that fails is repaired by the run's own repair turn.

## 5. `cards/flows`, `cards/screens`, `cards/card-format`: the ceiling

On the settled measure (Haiku, `--split tune`, all cases, 1 repetition) the deterministic checks are at their ceiling for flows and screens, so no draft can win under DEC-235 (it needs fewer unusable or repaired answers or higher label agreement, and these sets have no labels):

| Prompt           | Run      | Cases | Valid first try | Repaired | Unusable | Refused / RST | Input | Output | Latency |
| ---------------- | -------- | ----- | --------------- | -------- | -------- | ------------- | ----- | ------ | ------- |
| `flows.v1`       | `223102` | 8     | 8 of 8          | 0        | 0        | 0 / none      | 9341  | 1276   | 5.0 s   |
| `screens.v2`     | `223153` | 7     | 7 of 7          | 0        | 0        | 0 / none      | 8971  | 1641   | 6.2 s   |
| `card-format.v6` | `223231` | 5     | 5 of 5          | 0        | 0        | 0 / none      | 7907  | 1792   | 6.6 s   |

Held-back, Haiku, 2 repetitions: flows 2 of 2 (`230505`, 1 case), screens 2 of 2 (`230551`, 1 case); the held-back sets of flows and screens hold **one case each**, so no keep decision on them could carry weight in any case. **No rounds were run on `flows` or `screens`**: at 100% valid and 0 unusable on 15 tune runs (and 8 of 8 on Sonnet and Opus samples), the lab has nothing to separate versions.

`card-format.v6` is not quite at the ceiling: with 4 repetitions of the 5 tune cases (`230923`) it is 18 of 20 valid, 2 `Partial` (a card dropped for a problem), 0 unusable, and on the held-back cases (3, 2 repetitions, `230640`) 4 of 6 valid and 2 `Unusable`. **I did not run rounds on it**, because the lab records only the label `Partial` and the first 2000 characters of the answer: the problems the parser found are not in `results.json`, so a failing case cannot be read to say what to change, and a guess at one more sentence in a 90-line prompt that is the most expensive in the family (28% of the cards cost) would be tuning blind.

### Proposed, not built: deterministic checks that could separate versions

1. **Record the parser's problems per case** (`problems` in `results.json`: path and message, no answer text). It would make `Partial` and `Unusable` readable and is the one thing `card-format` needs for its rounds.
2. **Citation precision** (all card prompts): the share of cited ranges that fall inside the lines the case replayed (the reads are in the case), and the share of claims whose range has start not after end and lies in the file. A card that cites lines it never read is the defect the verifier later rejects; the lab can count it with no model.
3. **Card-type coverage** (flows, screens): `cards/flows` should give at least one `FLOW` card with a trigger, an outcome and steps that each cite lines, for an area the code map marks; `cards/screens` one `SCRN` card per page file in the replay with its route and a claim citing each listed field. A version that writes fewer cards of the type is worse by a count, not by a judge.
4. **Restart rate and continuation length** for `cards/continue` already exist in this card (`Restarted`; output tokens).

## 6. What is left (P10-09)

- `cards/card-format`: rounds on Haiku once check 1 above exists, then a held-back decision (the set has 3 held-back cases).
- `cards/continue`: a `joinFragment` fix for a leading line break inside a cut string (its own RF and a real run) would let draft s1 of section 7 be kept; or a wording that Sonnet does not answer with a line break.
- `cards/flows`, `cards/screens`: a deterministic quality check (2 or 3 above) before any round can be kept.
- A step of two calls for `cards/continue` (the cut being the model's own first answer, cut at a fixed ratio) would remove the remaining synthetic part of the cut: the models still sometimes distrust an invented first card ("this card is wrong for configuration files").
- The end-to-end check of P10-11 (`rosetta-p10`) is where `continue.v2` meets a real cut answer.

## 7. Fix round after verification (2026-11-14): `continue.v2` is not kept

The verifier found two defects in section 4. Both were right.

**Finding 1: the first v2 dropped cards in a real run and the lab could not see it.** Its line "finish the card you were writing, then the cards list, then stop" is a stop rule. In a run, one continuation is asked when an area answer is cut (`answer-collector.ts` `nextMessage`), and the run keeps only what the continuation writes, so if card 2 of 6 was cut, v2 closes after card 2 and 4 cards are lost with no code, no `Partial` and no note. The lab cut had nothing planned after the cut card, so it rewarded stopping, and much of the output saving of section 4 (-29%) was dropped cards. The verifier's examples were right: valid v1 continuations added cards (Sonnet `225944`, Haiku `225026`) and v2 added none.

What changed in the lab (RF-1406 Givens first, then a red `test:` commit, then the code):

- **Coverage measure.** A continuation that finishes the cut card and is read whole, but leaves a file the case read with no claim citing it, is `Uncovered` and not usable. The cut is made from the case's first read; a case with two files read stands for an answer with two cards to come. Seven of the eight cases read two ranges and six of those two different files; held-back: `...-005` two files, `...-191` one file read twice, `...-036` one file. The check compares the paths of the citations with the paths of the reads; no judge. A continuation that is cut again is not checked. Limits: it is a proxy (a model may rightly find nothing to write for a file), and first-try validity cannot see it, because that reads the fragment without the case (so an `Uncovered` run still counts as "valid on the first try"; read "not usable").
- **Reachable turn.** The continue replay said "Turns left: 1", a state a run never reaches (a continuation is a turn like any other, Q-55). It now says two turns left.
- On this measure the first v2 (with the stop rule) is `Uncovered` in 9 of 10 Haiku tune runs (`235811`) and the same prompt with the stop line removed and nothing in its place (`s0`, `235851`) in 6 of 10; v1 is `Uncovered` 3, `Restarted` 5, `Unusable` 1 and valid 1 of 10 (`235740`).

**Candidates without the stop rule.** The stop line is replaced by "After the card you were writing, go on with the cards your answer still had to hold: one for each file you read that has no card yet. Then close the list." Every other line is as in round 6 of section 3 unless stated. Run ids have the prefix `20261113-` up to `235952` and `20261114-` after.

| Draft | Change                                                                             | Haiku tune, 10 runs                                      | Haiku held-back, 18 runs                     | Sonnet held-back, 18 runs                               |
| ----- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| v1    | current                                                                            | 1 valid (`235740`)                                       | 3 valid, 15 not usable (`000458`)            | 17 valid, 1 Uncovered (`001042`)                        |
| s1    | the replacement line                                                               | 7 valid (`235952`); 18 of 20 on 4 repetitions (`000908`) | 14 valid, 3 Restarted, 1 Unusable (`000612`) | 17 valid, 1 Unusable (`001142`)                         |
| s2    | s1 and "a claim is written {"text": ..., "citations": [...]}: close the string..." | 5 and 7 valid (`000056`, `000148`)                       | 14 valid, 3 Unusable, 1 Partial (`000721`)   | 17 valid, 1 Unusable (`001238`)                         |
| s3    | s1 without the words "no line break" and "before the JSON"                         |                                                          | 17 valid, 1 Unusable (`001503`)              | 16 valid, 2 Unusable (`001341`)                         |
| s4    | s1 and a worked example of a reply that starts with the next characters            |                                                          | 17 valid, 1 Unusable (`001718`)              | 17 valid, 1 Unusable (`001610`); 7 of 9 more (`001752`) |
| s5    | v1 plus only the keep-it, go-on and close rules                                    |                                                          | 14 valid, 1 Restarted, 3 Unusable (`002018`) | 15 valid, 2 Unusable, 1 Restarted (`001848`)            |

**Finding 2: Sonnet, strict reading (the orchestrator's ruling): no regression on validity, unusable, repairs, refusals or RST on any model, on the same held-back cases and repetitions.**

- **The 29 against 27 of section 4.** The "29 of 29" added the 2-run sample `225349` (2 cases, 1 repetition) to the 27 comparable runs (`225944` 9 and `230256` 18). The matched count was v1 27 of 27 and v2 26 of 27 (old measure).
- **New measure, matched repetitions (9 + 18 = 27 runs each).** v1 (`000235`, `001042`): 25 usable, 2 not usable (1 `Restarted`, 1 `Uncovered`), first-try valid 26. s1 (`000305`, `001142`): 25 usable, 2 not usable (both `Unusable`), first-try valid 25.
- **The failure differs.** Every Sonnet-failing candidate answer began with a raw line break inside the cut string (`"\n shown, ..."`), which `joinFragment` does not strip and which breaks the JSON. v1 never did (0 of 45 Sonnet runs over all measures); every candidate wording did, about 1 run in 9 to 1 in 18 (s1 2 of 27, s2 2 of 27, s3 2 of 18, s4 3 of 27, s5 2 of 18). Naming the line break, dropping the words, adding an example or shortening the prompt (s1 to s5) did not remove it.
- **First-try validity.** s1 is one run below v1 (25 against 26). That run is partly the lab's blind spot (v1's `Uncovered` run counts as valid on the first try), but under the strict reading a lower number is a regression.

**Decision: not kept.** Under the strict reading no candidate holds on Sonnet (the leading line break, and a first-try validity below v1's), and `joinFragment` and other production code may not change in this PR. **`continue.v1` stays current.** The `continue.v2.md` file and its loader, manifest and architecture changes were removed by new commits (the earlier commits stay in history). A fix of `joinFragment` (strip a leading line break when the cut ends inside a string) would be a production change with its own RF and a real run; with it s1 would be the candidate: on Haiku held-back it turns 3 valid of 18 into 14 valid (not usable 15 to 4), with input +2.4% (8388 to 8592), output -5%, latency -6%; on Sonnet output -15% and latency -24%.

**Best candidate (s1), the whole text, not kept:**

```text
Your last answer stopped before its JSON was complete; it was probably cut off by the output limit.

Continue exactly where it stopped: reply with only the rest of the JSON, starting at the next character, and nothing else.
Your reply is pasted straight after the last character of the earlier text.
Do not repeat what you already wrote and do not start again. Do not call tools.
The earlier text is kept as it is, even if you would write it differently: do not correct it or replace it, and write no explanation and no code fence before the JSON.
If the text stopped inside a string, your reply goes on with the next word of that string, with no new opening quote and no line break, and you close the string with a quote.
After the card you were writing, go on with the cards your answer still had to hold: one for each file you read that has no card yet. Then close the list.
Close every string, list and object that is still open, in the right order, so that the earlier text and your reply together are one valid JSON object.
```

**The trade-off.** A wording that stops after the cut card saves output tokens and latency by writing less, and a run pays for it in cards that are never written. A wording that goes on keeps the cards and saves about 5% of output, not 29%. On a lab with no cards to come, a stop rule looks like a gain; the coverage measure above is what makes the difference visible, and any later tuning of `cards/continue` must be scored on it.

**Spend.** The fix round cost $1.78 (23 runs, `235740` to `002018`); the card total is **$3.66 of $4.50** (69 runs, no judge). The shared ledger stood at about $15.9 when the last run ended.
