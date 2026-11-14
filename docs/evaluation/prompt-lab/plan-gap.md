# Round log: the plan gap and repair prompts (P10-07)

Status 2026-11-14 (after the verifier's fix round): **no version kept.** `planner/gap.v6`, `planner/gap-repair.v4`, `planner/plan-repair.v2` and `cards/repair.v6` stay current. **Each of the four prompts has had three Haiku rounds**, which is the done-when of P10-05 that P10-07 shares, so no round is owed.

- The lab now gives what a run does after a gap or repair answer as numbers: the count of each label and the rate of each follow-up (section 1).
- Haiku 5.5 ran every round. Sonnet 5.5 and Opus 5.5 ran matched held-back samples.
- No judge call was made (the planner and cards judges are advisory).
- Run ids are folders of `lab-out/` of the P10-07 worktree, prefix `20261114-`.
- Spend: **$1.25 of the $3.00 slice** (48 runs).

Keep rule: DEC-231, then DEC-235, read with the orchestrator's ruling recorded as DEC-237 (PR #1410). "No regression" holds on every model measured, on the same held-back cases and repetitions. Only matched runs are compared, and sample runs are never pooled. A rise in a follow-up rate, or in a label that is not usable, is a regression on repairs (RF-1403).

## 1. The measure (settled first, fixed after verification)

**Held-back status.** Every set has held-back cases, so a version of each prompt could be kept (DEC-234). No case was added.

| Set                   | Cases | Held back | Note                                  |
| --------------------- | ----- | --------- | ------------------------------------- |
| `planner-gap`         | 5     | 2         |                                       |
| `planner-gap-repair`  | 5     | 2         |                                       |
| `planner-plan-repair` | 4     | 2         | since the re-capture of P10-08, #1408 |
| `cards-repair`        | 5     | 3         |                                       |

**What the lab read before.** The labels were too coarse to separate versions:

- a gap or gap repair answer was `Cards` or `NoCards`;
- a plan repair was `Tasks` or `NoTasks`;
- a card repair was `Valid`, `Partial` or `Unusable`.

Every set was at 100% on every model (P10-04 baseline).

**What it reads now.** Each check had its Givens in RF-1406 or RF-1403 first, then a red `test:` commit, then the code. Each uses the run's own rules and no judge. Each lab label is paired with the step a real run takes next.

- **Every target** (RF-1403). The summary and the `--compare` totals print the count of each label (`Results by label: Covered 4, LeftOut 1, Open 1`). A target that names follow-ups also prints the rate of each (`Follow-ups a run would make: repair call 17%, second round 33%`). A follow-up is counted apart from the label, so one answer can count for two. The lab's own `repaired` rate stays 0 here, because these targets make one call. The follow-up rates are the repair rates.
- **`planner/gap` and `planner/gap-repair`** (`gap-coverage.ts`). A card counts when the run's `draftFault` finds nothing in it and it builds an item of the block. A link counts when it names a card of the plan other than the migrations card. A `requirement:` item is also covered by a counted card that lists the requirement, as the run's `coverageOf` does.
  - Labels:
    - `LeftOut`: a card left out names an open item, or gives no valid builds. **A run makes its one repair call.**
    - `Open`: an item that is not a module or the deployment stays open. **A run asks a second round, then may end RST-1806.**
    - `ModulesOpen`: only modules or the deployment are left. **A run lists them in `checks.md`, with no further call.**
    - `Covered`: nothing is left.
  - Follow-ups:
    - `repair call` (gap only).
    - `second round`: counted even when the repair call is also due, so it is the most a run would need. A gap repair names only `second round`, because a run makes no second repair.
  - Limits:
    - `Covered` counts coverage, not how the work is split: one card that builds every item is `Covered`, and no judge looked at card scope. The gap rounds below go towards merging cards (one card for the copies of a module), so a `Covered` answer there may hold fewer, larger cards. Nothing here says whether that is better work.
    - Before the fix round, a `LeftOut` answer hid whether it also left an item open. In the gap runs before `023228`, `repair call` equals the count of `LeftOut`, and `second round` is at least the count of `Open`.
- **`planner/plan-repair`** (`plan-repair-check.ts`). The answer is assembled with the run's `assemblePlan` over the case's cards. It is specification-driven when the brief names `sdd`, which all four cases do.
  - Labels:
    - `NoRequirements`: not usable. **A run whose first answer kept none ends RST-1803.**
    - `Shrunk`: not usable. The plan keeps no phase or no task card, or a `FEAT` card of the case is cited by no requirement (the run's `sourceCardsWithNoRequirement`). **A run that takes the repair skips its gap rounds, or has nothing to hand over, or its package is silent on that feature.**
    - `LeftOut`: usable. **The assembly drops an item, which the run logs.**
    - `Fixed`: nothing is lost.
  - The first check missed the deletion: `{"requirements":[one],"phases":[],"tasks":[]}` read `Fixed`, and a run's `better()` would have picked it. That probe is now a test, and it reads `Shrunk`.
- **`cards/repair`** (`cards-repair-merge.ts`). An answer with no parser problem is merged into the earlier answer's readable cards with the run's `mergeDrafts`.
  - Labels:
    - `Fixed`: every card the earlier answer wrote keeps at least as many claims as it wrote.
    - `Dropped`: not usable. **A run keeps the card without the claim the repair was asked to fix, and sends no second repair.**
  - Follow-up: `second repair` after `Partial`, `Unusable` or `ReadsMore`.
  - Limit: the count of claims in the merged answer is not a check, because more cards are not better by themselves.

**Not replayed:**

- the requirement check of an SDD gap card (a case holds no requirement sources);
- the dependencies;
- the run's choice of the better of the first plan answer and its repair;
- the second card repair.

**Count mismatch.** The gap repair cases list every item of the gap case in the block, but a run's repair block lists only the items still open after the first answer. A lab repair answer therefore writes cards for 5 to 24 items, where a run's would write for the few that failed. That is why its output is as large as the gap call's. The figures compare versions on the same cases; they are not a run's repair cost.

## 2. Baselines and repair rates (current versions)

All rates are 0 on these cases, except `cards/repair.v6`, which drops a claim the repair was asked to fix in about 1 run in 7.

| Prompt (run)              | Model  | Split, reps  | Calls | Labels             | Follow-ups and losses   | In / out tokens | Latency | Cost per call |
| ------------------------- | ------ | ------------ | ----- | ------------------ | ----------------------- | --------------- | ------- | ------------- |
| gap.v6 (`010702`)         | Haiku  | tune, 2      | 6     | Covered 6          | repair call 0, second 0 | 5518 / 4311     | 17.3 s  | $0.0025       |
| gap.v6 (`013512`)         | Haiku  | held-back, 3 | 6     | Covered 6          | repair call 0, second 0 | 5720 / 5694     | 23.2 s  | $0.0032       |
| gap.v6 (`014327`)         | Sonnet | held-back 1  | 1     | Covered 1          | 0                       | 4624 / 1051     | 7.8 s   | $0.022        |
| gap.v6 (`014415`)         | Opus   | held-back 1  | 1     | Covered 1          | 0                       | 4626 / 1589     | 13.5 s  | $0.055        |
| gap-repair.v4 (`010852`)  | Haiku  | tune, 2      | 6     | Covered 6          | second 0                | 6700 / 3931     | 15.8 s  | $0.0024       |
| gap-repair.v4 (`014022`)  | Haiku  | held-back, 3 | 6     | Covered 6          | second 0                | 6931 / 6257     | 24.9 s  | $0.0036       |
| gap-repair.v4 (`014348`)  | Sonnet | held-back 1  | 1     | Covered 1          | 0                       | 5820 / 934      | 6.8 s   | $0.016        |
| gap-repair.v4 (`014454`)  | Opus   | held-back 1  | 1     | Covered 1          | 0                       | 5824 / 2230     | 19.6 s  | $0.059        |
| plan-repair.v2 (`023228`) | Haiku  | tune, 3      | 6     | Fixed 6            | none lost               | 12782 / 5260    | 21.6 s  | $0.0037       |
| plan-repair.v2 (`024528`) | Haiku  | held-back, 3 | 6     | Fixed 6            | none lost               | 12499 / 5351    | 22.0 s  | $0.0036       |
| plan-repair.v2 (`015130`) | Sonnet | held-back 1  | 1     | Fixed 1 (old)      | not Shrunk-checked      | 11759 / 1867    | 11.5 s  | $0.048        |
| plan-repair.v2 (`015201`) | Opus   | held-back 1  | 1     | Fixed 1 (old)      | not Shrunk-checked      | 11753 / 2660    | 21.7 s  | $0.112        |
| card repair.v6 (`023248`) | Haiku  | tune, 3      | 6     | Fixed 5, Dropped 1 | second repair 0         | 10295 / 616     | 2.8 s   | $0.0009       |
| card repair.v6 (`024250`) | Haiku  | held-back, 3 | 9     | Fixed 8, Dropped 1 | second repair 0         | 9053 / 599      | 2.5 s   | $0.0008       |
| card repair.v6 (`024812`) | Sonnet | held-back, 1 | 3     | Fixed 2, Dropped 1 | second repair 0         | 9051 / 499      | 3.5 s   | $0.018        |
| card repair.v6 (`024842`) | Opus   | held-back, 1 | 3     | Fixed 3            | second repair 0         | 9057 / 547      | 4.7 s   | $0.038        |

Notes on the table:

- Runs `011024` (plan repair, `Tasks` 4) and `011036` (card repair, `Valid` 4) were the first Haiku tune baselines, under the labels from before the checks. They are superseded by `023228` and `023248`.
- Run `011807` scored first-try validity 0% through the bug noted in section 1.
- The plan repair rows marked "old" were run before `Shrunk` existed. Their labels hold, but they were not checked for a shrunk plan.
- The plan repair itself is the run's repair of the package answer (P10-08's prompt), so these sets cannot lower how often it is asked.

## 3. Rounds (Haiku, tune; each draft is the current file plus the changes of the rounds before it, unless stated)

| Prompt      | Round | Change (one thing)                                                                                                         | Run      | Labels (tune)                         | In / out tokens against the baseline | Latency | Decision                        |
| ----------- | ----- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- | ------------------------------------ | ------- | ------------------------------- |
| gap         | 1     | rule 4: copies of one application in two solutions are ported or retired by one card naming every copy                     | `012356` | Covered 6                             | +1.3% / -9%                          | -7%     | input up: fails the strict rule |
| gap         | 2     | the same rule in 14 words, paid for by a shorter opening paragraph (from v6)                                               | `012552` | Covered 5, Open 1                     | -0.1% / -18%                         | -13%    | worse: an item left open        |
| gap         | 3     | "the copies of one module in two solutions" added to what belongs together; a sentence said twice dropped (from v6)        | `012748` | Covered 6                             | -0.1% / -11%                         | -9%     | candidate                       |
| gap-repair  | 1     | the repeated answer example dropped                                                                                        | `013103` | Covered 6                             | -3.5% / +2.5%                        | +5%     | flat                            |
| gap-repair  | 2     | round 1 plus one card for the copies of a module                                                                           | `013237` | Covered 6                             | -3.2% / -17%                         | -15%    | candidate                       |
| gap-repair  | 3     | round 2 plus "check that each module id of the first block is in some `builds`"                                            | `024207` | Covered 5, LeftOut 1 (second round 1) | -3.0% / -1%                          | -1%     | worse                           |
| plan-repair | 1     | the bullet that lists the JSON arrays dropped                                                                              | `023608` | Fixed 6                               | -0.6% / -3.6%                        | -6%     | go on                           |
| plan-repair | 2     | round 1 plus "Write no text other than the JSON." dropped (the package prompt says it)                                     | `023806` | Fixed 6                               | -0.7% / -8.5%                        | -11%    | candidate                       |
| plan-repair | 3     | round 2 plus "and every phase and task card kept"                                                                          | `024030` | Fixed 6                               | -0.6% / +11%                         | +8%     | worse                           |
| card repair | 1     | "Keep the cards that were correct." replaced by "Write again only the cards a problem is about; Rosetta keeps the others." | `023301` | Fixed 6                               | +0.1% / -50%                         | -43%    | candidate (`Dropped` 1 to 0)    |
| card repair | 2     | round 1 plus "each whole with every claim it had"                                                                          | `023349` | Fixed 6                               | +0.2% / -27%                         | -12%    | weaker than round 1             |
| card repair | 3     | round 1 without "; Rosetta keeps the others" (from v6)                                                                     | `023403` | Fixed 6                               | +0.05% / -44%                        | -36%    | weaker than round 1             |

Baselines on the same tune cases and repetitions:

| Prompt      | Baseline run |
| ----------- | ------------ |
| gap         | `010702`     |
| gap-repair  | `010852`     |
| plan-repair | `023228`     |
| card repair | `023248`     |

Earlier card repair figures `012839` (v6) and `012823` (round 1) were taken before the merged check, as `Valid` 6 each. Round 1 was then set aside, because a `Valid` answer could not show what it lost. With the merged check it loses nothing the earlier answer had; what it no longer writes are the extra cards v6 sometimes adds.

Two things drive the gap figures:

- The output of a gap round is dominated by the case with 24 items, of which 10 are modules. The eShop solutions hold each front end twice, legacy and modernised, so one card for both copies was tried.
- The gap rounds ran before the fix round. The gap labels did not change in it: the committed gap sets hold no `requirement:` item.

## 4. Held-back decisions (matched runs, DEC-237)

Only the best candidate of each prompt was taken to the held-back cases. The figures give the current version, then the candidate.

### gap round 3 against gap.v6

| Model  | Selection, reps | Current (run)                             | Candidate (run)                                          | Finding                                         |
| ------ | --------------- | ----------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| Haiku  | held-back, 3    | Covered 6; 5720 / 5694; 23.2 s (`013512`) | Covered 5, **LeftOut 1**; 5721 / 5721; 23.5 s (`013736`) | repair call 0 to 1; tokens, latency and cost up |
| Sonnet | held-back 1, 1  | Covered; 4624 / 1051 (`014327`)           | Covered; 4626 / 1083 (`014338`)                          | output +3%                                      |
| Opus   | held-back 1, 1  | Covered; 4626 / 1589 (`014415`)           | Covered; 4610 / 1378 (`014431`)                          | better                                          |

**Not kept**: it regressed on Haiku (a repair call) and on Sonnet (output).

### gap-repair round 2 against v4

| Model  | Selection, reps | Current (run)                             | Candidate (run)                                              | Finding                    |
| ------ | --------------- | ----------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| Haiku  | held-back, 3    | Covered 6; 6931 / 6257; 24.9 s (`014022`) | Covered 5, **ModulesOpen 1**; 6714 / 5692; 23.0 s (`014243`) | a module left with no card |
| Sonnet | held-back 1, 1  | Covered; 5820 / 934; 6.8 s (`014348`)     | Covered; 5608 / 1056; 8.6 s (`014359`)                       | output +13%, latency +27%  |
| Opus   | held-back 1, 1  | Covered; 5824 / 2230 (`014454`)           | Covered; 5607 / 1602 (`014511`)                              | better                     |

**Not kept**: it regressed on Haiku (content lost) and on Sonnet.

### plan-repair round 2 against v2

| Model | Selection, reps | Current (run)                            | Candidate (run)                          | Finding                                  |
| ----- | --------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Haiku | held-back, 3    | Fixed 6; 12499 / 5351; 22.0 s (`024528`) | Fixed 6; 12410 / 5355; 21.7 s (`024742`) | input -0.7%, output +0.1%, cost the same |

**Not kept**: there is no quality gain, so the strict rule applies, and output rose by 4 tokens a call. It was not run on Sonnet or Opus.

### card repair round 1 against v6

| Model  | Selection, reps | Current (run)                                     | Candidate (run)                                   | Finding                                                         |
| ------ | --------------- | ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Haiku  | held-back, 3    | Fixed 8, Dropped 1; 9053 / 599; 2.46 s (`024250`) | **Fixed 9**; 9063 / 499; 2.18 s (`024313`)        | quality gain; input +0.1%, output -17%, latency -11%, cost -14% |
| Sonnet | held-back, 1    | Fixed 2, Dropped 1; 9051 / 499; 3.48 s (`024812`) | Fixed 2, Dropped 1; 9064 / 361; 2.76 s (`024824`) | no quality change; **input +0.14%**; output -28%, cost -32%     |
| Opus   | held-back, 1    | Fixed 3; 9057 / 547; 4.72 s (`024842`)            | Fixed 3; 9061 / 411; 4.16 s (`024858`)            | no quality change; **input +0.04%**; output -25%, cost -32%     |

**Not kept**, for two reasons:

- On Haiku the candidate clears DEC-235: one fewer `Dropped`, and input +0.1%, well inside 15%.
- On Sonnet and Opus there is no quality gain, so the strict rule applies there, and input rose (+13 and +4 tokens a call). Under DEC-237 that is a regression on two of the three models.

It is also untried where the earlier answer could not be read at all (every committed case has a citation fault). There, "write again only the cards a problem is about" leaves the model to judge that every card is meant. That is the case P10-09's lesson warns about.

### Best candidates, not kept

- **gap round 3.** The full change is in section 3.
- **gap-repair round 2.** Grouping module copies saves output on tune but drops or mis-names an id about once in six held-back answers.
- **plan-repair round 2.** It is noise-level: a trim that does not move the output.
- **card repair round 1.** It is the strongest:
  - half the output on tune;
  - no `Dropped` on Haiku held-back;
  - a third off the cost per call on Sonnet and Opus.

  The full text of the draft is v6 with that one sentence replaced. A next step would fix two things, and the two together would let it be kept under the strict reading:
  1. Find a wording that adds no input token, for example "Write only the cards a problem names." in place of the 7-word sentence. Try it on tune first.
  2. Add a hand-made `cards-repair` variant whose earlier answer is not JSON at all, on the side of its base case.

## 5. The three-round rule and what was not done

**Three Haiku rounds per prompt (the done-when that P10-07 shares with P10-05):**

| Prompt      | Rounds | Kept |
| ----------- | ------ | ---- |
| gap         | 3      | none |
| gap-repair  | 3      | none |
| plan-repair | 3      | none |
| card repair | 3      | none |

Every prompt met the rule. No kept version is owed a beat, because none was kept.

**Not done:**

- No version was kept, so no prompt file, loader, manifest or `prompt-files` test changed.
- No held-back case was added and none was re-captured (DEC-236).
- No judge call was made, and no card scope was judged.
- The plan repair candidate was not run on Sonnet or Opus, because it failed on Haiku.
- The plan repair rows of section 2 for Sonnet and Opus predate `Shrunk`.
- A run's real repair rate needs a plan run: the end-to-end check of P10-11.
