# Round log: the plan gap and repair prompts (P10-07)

Status 2026-11-14: **no version kept.** `planner/gap.v6`, `planner/gap-repair.v4`, `planner/plan-repair.v2` and `cards/repair.v6` stay current. The lab now measures what a run does after a gap or repair answer (section 1), so the repair rate is a lab number. Haiku 5.5 ran every round; Sonnet 5.5 and Opus 5.5 ran matched samples of one held-back case. No judge call was made (the planner and cards judges are advisory). Run ids are folders of `lab-out/` of the P10-07 worktree, prefix `20261114-`. Spend: **$0.79 of the $3.00 slice** (31 runs).

Keep rule: DEC-231, then DEC-235, read with the orchestrator's ruling recorded as DEC-237 (PR #1410): "no regression" holds on every model measured, on the same held-back cases and repetitions; only matched runs are compared and sample runs are never pooled. Every candidate below added no quality a deterministic check could see, so it could be kept only under the strict rule of DEC-231: no regression on any check, tokens, latency and cost included.

## 1. The measure (settled first)

**Held-back status.** Every set has held-back cases, so a version of each prompt could be kept (DEC-234): `planner-gap` 5 cases (2 held back), `planner-gap-repair` 5 (2), `planner-plan-repair` 4 (2, since the re-capture of P10-08, #1408), `cards-repair` 5 (3). No case was added.

**What the lab read before.** A gap or gap repair answer was `Cards` or `NoCards`, a plan repair `Tasks` or `NoTasks`, a card repair `Valid`, `Partial` or `Unusable`. Every set was at 100% on every model (P10-04 baseline), so nothing could separate versions, and the lab could not say whether a run would have needed a repair.

**What it reads now** (RF-1406 Givens, then red `test:` commits, then the code; the run's own rules, no judge):

- `planner/gap` and `planner/gap-repair` (`gap-coverage.ts`): a card counts when the run's `draftFault` finds nothing (a phase of the plan, a risk class, an invariant, Given-When-Then items, probes where required) and it builds an item of the block; a link counts when it names a card of the plan other than the migrations card. `LeftOut`: a card left out names an item still open, or gives no valid builds while one is open. **In a run, the gap call is then followed by its one repair call**; after a repair, the card is logged as left out. `Open`: an item that is not a module or the deployment is built by no card. **A run then asks a second gap round and, if the item stays open, ends RST-1806.** `ModulesOpen`: only modules or the deployment are left. **A run lists them in `checks.md`, with no further call.** `Covered`: nothing is left. So the share of `LeftOut` on `planner/gap` is the gap repair rate of a run, and `Open` is the second-round rate.
- `planner/plan-repair` (`plan-repair-check.ts`): the answer is assembled with the run's `assemblePlan` over the case's cards, specification-driven when the brief names `sdd` (all four cases do). `NoRequirements` (not usable): **a run whose first answer kept none ends RST-1803**. `LeftOut`: **a requirement, a task card or an item would be missing from the package of a run, and the run logs it.** `Fixed`: nothing is lost. First-try validity stays the parser's reading (a first version of the check made it 0%, run `011807`; a red test and a fix followed).
- `cards/repair` keeps its labels. A run sends a second repair after `Partial` or `Unusable`, so the share of those is the second-repair rate. A run also merges the repair's cards into the earlier answer's readable cards (`mergeDrafts`), so the share of `Valid` answers alone cannot see a repair that writes less (section 4).

**Not replayed:** the requirement check of an SDD gap card (a case holds no requirement sources), the dependencies, the run's choice of the better of the first plan answer and its repair, and the second card repair.

**Count mismatch.** The gap repair cases list every item of the gap case in the block, but a run's repair block lists only the items still open after the first answer. A lab repair answer therefore writes cards for 5 to 24 items, where a run's would write for the few that failed. That is why its output is as large as the gap call's. The figures compare versions on the same cases; they are not a run's repair cost.

## 2. Baselines and repair rates (current versions)

| Prompt (run)                        | Model  | Split, reps  | Calls | Result    | Repair rate in a run    | In / out tokens | Latency | Cost per call |
| ----------------------------------- | ------ | ------------ | ----- | --------- | ----------------------- | --------------- | ------- | ------------- |
| gap.v6 (`010702`)                   | Haiku  | tune, 2      | 6     | Covered 6 | 0 of 6 repair, 0 second | 5518 / 4311     | 17.3 s  | $0.0025       |
| gap.v6 (`013512`)                   | Haiku  | held-back, 3 | 6     | Covered 6 | 0 of 6 repair, 0 second | 5720 / 5694     | 23.2 s  | $0.0032       |
| gap.v6 (`014327`, `014415`)         | Sonnet | held-back, 1 | 1     | Covered 1 | 0                       | 4624 / 1051     | 7.8 s   | $0.022        |
|                                     | Opus   | held-back, 1 | 1     | Covered 1 | 0                       | 4626 / 1589     | 13.5 s  | $0.055        |
| gap-repair.v4 (`010852`)            | Haiku  | tune, 2      | 6     | Covered 6 | 0 left out after repair | 6700 / 3931     | 15.8 s  | $0.0024       |
| gap-repair.v4 (`014022`)            | Haiku  | held-back, 3 | 6     | Covered 6 | 0                       | 6931 / 6257     | 24.9 s  | $0.0036       |
| gap-repair.v4 (`014348`, `014454`)  | Sonnet | held-back, 1 | 1     | Covered 1 | 0                       | 5820 / 934      | 6.8 s   | $0.016        |
|                                     | Opus   | held-back, 1 | 1     | Covered 1 | 0                       | 5824 / 2230     | 19.6 s  | $0.059        |
| plan-repair.v2 (`015049`)           | Haiku  | tune, 3      | 6     | Fixed 6   | 0 lost after repair     | 12777 / 5264    | 21.2 s  | $0.0036       |
| plan-repair.v2 (`014839`)           | Haiku  | held-back, 3 | 6     | Fixed 6   | 0                       | 12496 / 5111    | 20.5 s  | $0.0036       |
| plan-repair.v2 (`015130`, `015201`) | Sonnet | held-back, 1 | 1     | Fixed 1   | 0                       | 11759 / 1867    | 11.5 s  | $0.048        |
|                                     | Opus   | held-back, 1 | 1     | Fixed 1   | 0                       | 11753 / 2660    | 21.7 s  | $0.112        |
| card repair.v6 (`012839`)           | Haiku  | tune, 3      | 6     | Valid 6   | 0 second repairs        | 10296 / 473     | 2.1 s   | $0.0009       |
| card repair.v6 (`015115`)           | Haiku  | held-back, 3 | 9     | Valid 9   | 0                       | 9056 / 621      | 2.5 s   | $0.0009       |
| card repair.v6 (`015136`, `015209`) | Sonnet | held-back, 1 | 1     | Valid 1   | 0                       | 7813 / 397      | 2.7 s   | $0.024        |
|                                     | Opus   | held-back, 1 | 1     | Valid 1   | 0                       | 7809 / 515      | 4.8 s   | $0.049        |

On these cases, the current versions need no repair, no second round and no second card repair, and lose nothing after a repair, on all three models. The new checks are also at the ceiling for the current versions. What they add is that a candidate can now fail them, and two did (section 3). The run that wrote a plan repair with every check passing still sends that repair call; the lab cannot lower the plan repair rate, because the plan repair follows the package answer, which is P10-08's prompt.

## 3. Rounds (Haiku, tune; each draft is the current file plus the change)

| Prompt      | Round | Change (one thing)                                                                                                                                                     | Run      | Result    | In / out tokens             | Latency       | Decision                                                  |
| ----------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | --------------------------- | ------------- | --------------------------------------------------------- |
| gap         | 1     | rule 4: "copies of one application (the same project in two solutions) are ported or retired by one card whose `builds` names every copy"                              | `012356` | Covered 6 | 5590 (+1.3%) / 3904         | 16.1 s        | input up: fails the strict rule                           |
| gap         | 2     | the same rule in 14 words, paid for by a shorter opening paragraph                                                                                                     | `012552` | Open 1    | 5510 / 3523                 | 15.0 s        | worse: an item left open (a run would ask a second round) |
| gap         | 3     | "the copies of one module in two solutions" added to the list of what belongs together; "These are the only items you write cards for." dropped (said again in rule 1) | `012748` | Covered 6 | 5515 (-0.1%) / 3831 (-11%)  | 15.8 s (-9%)  | candidate                                                 |
| gap-repair  | 1     | the repeated answer example dropped (the gap prompt, the system prompt of the repair, has one)                                                                         | `013103` | Covered 6 | 6464 (-3.5%) / 4030 (+2.5%) | 16.6 s (+5%)  | flat: output and latency up                               |
| gap-repair  | 2     | round 1 plus "Copies of one module in two solutions get one card that builds every copy." in the module line                                                           | `013237` | Covered 6 | 6486 (-3.2%) / 3263 (-17%)  | 13.4 s (-15%) | candidate                                                 |
| card repair | 1     | "Keep the cards that were correct." replaced by "Write again only the cards a problem is about; Rosetta keeps the others."                                             | `012823` | Valid 6   | 10312 (+0.2%) / 299 (-37%)  | 1.5 s (-26%)  | not pursued (section 4)                                   |

Baselines of the same tune cases and repetitions: gap `010702`, gap-repair `010852`, card repair `012839`. The output of a gap round is dominated by the case with 24 items, of which 10 are modules: the eShop solutions hold each front end twice, legacy and modernised, which is why one card for both copies was tried. **plan-repair had no round.** It is `Fixed` 12 of 12 on Haiku. Its prompt is short; most of its 12 800 input tokens is the plan message. Its output is the whole plan again, which the run uses in place of the first answer. So it has no wording to cut that is not plan content, and no check that a new wording could improve.

## 4. `cards/repair`: a saving that is a loss in a run

Round 1 cut the output by 37%, and every answer stayed `Valid`. It was not taken to the held-back cases. The current version writes the faulty card again and often more: in `012839`, repetition 2 of case `054942` added a `FEAT` card and longer claims. The run merges every card of a repair with the earlier readable cards (`answer-collector.ts`, `mergeDrafts`), so those extra cards reach the run's output. The draft writes only the faulty card. Part of its saving is therefore cards and claims a run would no longer get, which is the trap of P10-09. A lab that reads the repair alone counts both as `Valid`. A fair test needs a check of the merged answer (the claims of the earlier readable cards plus the repair, merged as the run merges them). That check is not built.

## 5. Held-back decisions (matched runs, DEC-237)

| Candidate                     | Model  | Selection, reps | Current (run)                                       | Candidate (run)                                                        | Decision                                                                             |
| ----------------------------- | ------ | --------------- | --------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| gap round 3 against gap.v6    | Haiku  | held-back, 3    | Covered 6; 5720 / 5694; 23.2 s; $0.00320 (`013512`) | Covered 5, **LeftOut 1**; 5721 / 5721; 23.5 s; $0.00327 (`013736`)     | **not kept**: one gap answer would need the repair call; tokens, latency and cost up |
|                               | Sonnet | held-back 1, 1  | Covered; 4624 / 1051; 7.8 s (`014327`)              | Covered; 4626 / 1083; 7.7 s (`014338`)                                 | output +3%, input +2 tokens                                                          |
|                               | Opus   | held-back 1, 1  | Covered; 4626 / 1589; 13.5 s (`014415`)             | Covered; 4610 / 1378; 12.9 s (`014431`)                                | better on this one case                                                              |
| gap-repair round 2 against v4 | Haiku  | held-back, 3    | Covered 6; 6931 / 6257; 24.9 s; $0.00363 (`014022`) | Covered 5, **ModulesOpen 1**; 6714 / 5692; 23.0 s; $0.00332 (`014243`) | **not kept**: one module left with no card, the content a run would lose             |
|                               | Sonnet | held-back 1, 1  | Covered; 5820 / 934; 6.8 s (`014348`)               | Covered; 5608 / 1056; 8.6 s (`014359`)                                 | **output +13%, latency +27%**: a regression on Sonnet too                            |
|                               | Opus   | held-back 1, 1  | Covered; 5824 / 2230; 19.6 s (`014454`)             | Covered; 5607 / 1602; 14.6 s (`014511`)                                | better on this one case                                                              |

The Sonnet and Opus figures are one case and one repetition each (the first held-back case by id, `20261023-152751`, 5 items). They are shown matched and not pooled with the Haiku runs; they are too small to keep a version on alone. Each candidate failed on Haiku, and gap-repair round 2 also regressed on Sonnet.

**Best candidates, not kept** (the whole change is in section 3):

- `planner/gap`: round 3. On tune it saved 11% of the output with every item covered. On the held-back cases one answer of six left a card out that names an open item (a run would make the repair call), and the output saving was gone (+0.5%).
- `planner/gap-repair`: round 2. On tune it saved 17% of the output and 15% of the latency. On the held-back cases one answer of six left a module with no card, and on Sonnet it was slower.

Grouping the copies of a module saves output on the tune cases, which hold one solution pair per front end. On the held-back cases it makes the model drop or mis-name an id about once in six answers. A later round could pair it with a check in the prompt that every module id of the block is in some `builds`. That would be a new draft tried on tune first; the held-back cases of this set have been seen once now.

## 6. What was not done

- No version was kept, so no prompt file, loader, manifest or `prompt-files` test changed.
- No held-back case was added (none was needed), and no case was re-captured (DEC-236).
- `planner/plan-repair` had no tuning round (section 3).
- No judge call was made.
- The merged-answer check of `cards/repair` (section 4) is not built.
- A run's real repair rate needs a plan run, which is the end-to-end check of P10-11.
