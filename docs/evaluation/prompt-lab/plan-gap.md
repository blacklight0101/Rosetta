# Round log: the plan gap and repair prompts (P10-07)

Status 2026-11-14 (after the verifier's second fix round): **`planner/plan-repair.v3` is kept** (section 4); `plan-repair.v2` stays loadable. `planner/gap.v6`, `planner/gap-repair.v4` and `cards/repair.v6` stay current. **Each of the four prompts has had at least three Haiku rounds**, which is the done-when of P10-05 that P10-07 shares, so no round is owed.

- The lab now gives what a run does after a gap or repair answer as numbers: the count of each label and the rate of each follow-up (section 1).
- The second fix round changed the plan repair check: a repair that loses a card, or leaves a requirement no task lists, no longer reads `Fixed`. Under it the current `plan-repair.v2` is **not** at a repair rate of 0 (section 2), and that is what the kept round fixes.
- Haiku 5.5 ran every round. Sonnet 5.5 and Opus 5.5 ran matched held-back runs.
- No judge call was made (the planner and cards judges are advisory).
- Run ids are folders of `lab-out/` of the P10-07 worktree, prefix `20261114-`.
- Spend: **$2.67 of the $3.00 slice** (68 runs; $1.25 before the second fix round, $1.42 in it). The shared ledger stood at $22.71 after the last run.

Keep rule: DEC-231, then DEC-235, read with the orchestrator's ruling recorded as DEC-237 (PR #1410). "No regression" holds on every model measured, on the same held-back cases and repetitions. Only matched runs are compared, and sample runs are never pooled. A rise in a follow-up rate, or in a label that is not usable, is a regression on repairs (RF-1403).

## 1. The measure (settled first, fixed after verification)

**Held-back status.** Every set has held-back cases, so a version of each prompt could be kept (DEC-234). Four hand-made cases were added to `cards-repair` in the second fix round (below); none was re-captured (DEC-236).

| Set                   | Cases | Held back | Note                                                                    |
| --------------------- | ----- | --------- | ----------------------------------------------------------------------- |
| `planner-gap`         | 5     | 2         |                                                                         |
| `planner-gap-repair`  | 5     | 2         |                                                                         |
| `planner-plan-repair` | 4     | 2         | since the re-capture of P10-08, #1408                                   |
| `cards-repair`        | 9     | 6         | `cards-repair-2`: five cases plus four `-nojson` variants (3 held back) |

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
  - Labels (second fix round; content lost is never usable):
    - `NoRequirements`: not usable. **A run whose first answer kept none ends RST-1803.**
    - `Shrunk`: not usable. The plan keeps no phase or no task card, or a card of the case that is not an open question (`OQ`) is named in no `sources` list of the kept plan (requirements, decisions, entities, risks, technical items). **The package is silent on what that card shows; a run's `better()` may still pick the repair.**
    - `LeftOut`: not usable (it was usable before). **The assembly drops an item, so the repair lost content the run then logs.**
    - `Open`: usable. Every card is kept, but a kept requirement is listed by no task card. **A run sends a gap round for it** (the follow-up `gap round`, from the run's `coverageOf` over the requirement items).
    - `Fixed`: nothing is lost and every requirement has a task.
  - Follow-up: `gap round`, counted on every usable or unusable answer that keeps requirements.
  - The first check missed the deletion: `{"requirements":[one],"phases":[],"tasks":[]}` read `Fixed`. The first fix made that `Shrunk`, but the verifier's three probes still read `Fixed`: (a) every requirement kept but 1 task of 8; (b) one requirement citing `FEAT-001`, one phase, one task that builds nothing; (c) only the `FEAT` card cited, all tasks kept. They are now tests (`plan-repair-coverage.test.ts`): (a) reads `Open` with a gap round, (b) and (c) read `Shrunk`.
- **`cards/repair`** (`cards-repair-merge.ts`). An answer with no parser problem is merged into the earlier answer's readable cards with the run's `mergeDrafts`.
  - Labels:
    - `Fixed`: every card the earlier answer wrote keeps at least as many claims as it wrote.
    - `Dropped`: not usable. **A run keeps the card without the claim the repair was asked to fix, and sends no second repair.**
    - `Uncovered`: not usable. The earlier answer had no readable card (the `-nojson` cases) and the merged answer leaves a file the case read cited by no claim. **A run keeps only what the repair wrote, so that file's content is lost.**
  - Follow-up: `second repair` after `Partial`, `Unusable` or `ReadsMore`. A run reads a repair turn's text and ignores its tool calls (`answer-collector.ts`), so a turn that only asks to read more leaves the problems, and the run sends its second repair (`maxRepairs` 2); a test pins it.
  - The `-nojson` variants: four hand-made cases whose earlier answer is a line of prose, so the run's repair request says no card could be read. Each takes its base case's side of the split (RF-1405, as the `-spa` cases do).
  - Limit: the count of claims in the merged answer is not a check, because more cards are not better by themselves.

**Not replayed:**

- the requirement check of an SDD gap card (a case holds no requirement sources);
- the dependencies;
- the run's choice of the better of the first plan answer and its repair;
- the second card repair.

**Count mismatch.** The gap repair cases list every item of the gap case in the block, but a run's repair block lists only the items still open after the first answer. A lab repair answer therefore writes cards for 5 to 24 items, where a run's would write for the few that failed. That is why its output is as large as the gap call's. The figures compare versions on the same cases; they are not a run's repair cost.

## 2. Baselines and repair rates (current versions)

The gap and gap repair rates are 0 on these cases. The plan repair and card repair rows were measured again on the second fix round's checks (the first block of rows below the table head); **their repair rate is not 0**:

- `plan-repair.v2` loses content in most answers: on Haiku tune 4 of 6 are `Shrunk` and every answer needs a gap round; on Haiku held-back 3 of 6 are `Shrunk` and 4 of 6 need a gap round; on Sonnet both held-back answers are `Shrunk`.
- `cards/repair.v6` drops a claim it was asked to fix about 1 run in 6 on Sonnet; on Haiku and Opus it was `Fixed` on every case of the new set, the `-nojson` variants included.

| Prompt (run)              | Model  | Split, reps  | Calls | Labels                    | Follow-ups and losses | In / out tokens | Latency | Cost per call |
| ------------------------- | ------ | ------------ | ----- | ------------------------- | --------------------- | --------------- | ------- | ------------- |
| plan-repair.v2 (`032902`) | Haiku  | tune, 3      | 6     | Shrunk 4, Open 2          | gap round 6 of 6      | 12784 / 4519    | 18.0 s  | $0.0033       |
| plan-repair.v2 (`033306`) | Haiku  | held-back, 3 | 6     | Fixed 1, Open 2, Shrunk 3 | gap round 4 of 6      | 12499 / 5187    | 21.3 s  | $0.0035       |
| plan-repair.v2 (`035017`) | Sonnet | held-back, 1 | 2     | Shrunk 2                  | gap round 1 of 2      | 12498 / 2082    | 12.5 s  | $0.045        |
| plan-repair.v2 (`035148`) | Opus   | held-back, 1 | 2     | Fixed 1, Open 1           | gap round 1 of 2      | 12494 / 3472    | 29.2 s  | $0.118        |
| card repair.v6 (`032642`) | Haiku  | tune, 3      | 9     | Fixed 9                   | second repair 0       | 10707 / 1019    | 4.3 s   | $0.0013       |
| card repair.v6 (`033617`) | Haiku  | held-back, 3 | 18    | Fixed 18                  | second repair 0       | 8892 / 771      | 3.3 s   | $0.0009       |
| card repair.v6 (`033738`) | Sonnet | held-back, 1 | 6     | Fixed 5, Dropped 1        | second repair 0       | 8894 / 603      | 4.1 s   | $0.017        |
| card repair.v6 (`033846`) | Opus   | held-back, 1 | 6     | Fixed 6                   | second repair 0       | 8891 / 760      | 6.7 s   | $0.037        |

The rows below were taken before the second fix round. The gap and gap repair rows hold. The plan repair rows read `Fixed` under the old check, which could not see a lost card or a requirement with no task; the card repair rows used the five cases without the `-nojson` variants. Both are superseded by the rows above.

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
- The plan repair rows marked "old" were run before `Shrunk` existed, and every plan repair row of this second table before the second fix round's check.
- The plan repair itself is the run's repair of the package answer (P10-08's prompt), so these sets cannot lower how often it is asked.

## 3. Rounds (Haiku, tune; each draft is the current file plus the changes of the rounds before it, unless stated)

| Prompt      | Round | Change (one thing)                                                                                                                                                                                                                               | Run      | Labels (tune)                         | In / out tokens against the baseline | Latency | Decision                        |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------- | ------------------------------------ | ------- | ------------------------------- |
| gap         | 1     | rule 4: copies of one application in two solutions are ported or retired by one card naming every copy                                                                                                                                           | `012356` | Covered 6                             | +1.3% / -9%                          | -7%     | input up: fails the strict rule |
| gap         | 2     | the same rule in 14 words, paid for by a shorter opening paragraph (from v6)                                                                                                                                                                     | `012552` | Covered 5, Open 1                     | -0.1% / -18%                         | -13%    | worse: an item left open        |
| gap         | 3     | "the copies of one module in two solutions" added to what belongs together; a sentence said twice dropped (from v6)                                                                                                                              | `012748` | Covered 6                             | -0.1% / -11%                         | -9%     | candidate                       |
| gap-repair  | 1     | the repeated answer example dropped                                                                                                                                                                                                              | `013103` | Covered 6                             | -3.5% / +2.5%                        | +5%     | flat                            |
| gap-repair  | 2     | round 1 plus one card for the copies of a module                                                                                                                                                                                                 | `013237` | Covered 6                             | -3.2% / -17%                         | -15%    | candidate                       |
| gap-repair  | 3     | round 2 plus "check that each module id of the first block is in some `builds`"                                                                                                                                                                  | `024207` | Covered 5, LeftOut 1 (second round 1) | -3.0% / -1%                          | -1%     | worse                           |
| plan-repair | 1     | the bullet that lists the JSON arrays dropped                                                                                                                                                                                                    | `023608` | Fixed 6                               | -0.6% / -3.6%                        | -6%     | go on                           |
| plan-repair | 2     | round 1 plus "Write no text other than the JSON." dropped (the package prompt says it)                                                                                                                                                           | `023806` | Fixed 6                               | -0.7% / -8.5%                        | -11%    | candidate                       |
| plan-repair | 3     | round 2 plus "and every phase and task card kept"                                                                                                                                                                                                | `024030` | Fixed 6                               | -0.6% / +11%                         | +8%     | worse                           |
| plan-repair | 4     | v2 plus "Every card of the first block that is not an open question (`OQ`) stays in the `sources` of a requirement, a decision, an entity, a risk or a technical item: fixing a requirement never drops what another card shows." (second check) | `034148` | Open 5, Fixed 1 (gap round 5 of 6)    | +0.5% / +19%                         | +20%    | no card lost; go on             |
| plan-repair | 5     | round 4 plus "Every requirement is in the `requirements` of at least one task card." (second check)                                                                                                                                              | `034417` | Fixed 5, Open 1 (gap round 1 of 6)    | +0.7% / +35%                         | +35%    | candidate                       |
| plan-repair | 6     | round 5 minus the bullet that lists the JSON arrays (second check)                                                                                                                                                                               | `034655` | Fixed 5, Open 1 (gap round 1 of 6)    | +0.1% / +42%                         | +44%    | no better than round 5          |
| card repair | 1     | "Keep the cards that were correct." replaced by "Write again only the cards a problem is about; Rosetta keeps the others."                                                                                                                       | `023301` | Fixed 6                               | +0.1% / -50%                         | -43%    | candidate (`Dropped` 1 to 0)    |
| card repair | 2     | round 1 plus "each whole with every claim it had"                                                                                                                                                                                                | `023349` | Fixed 6                               | +0.2% / -27%                         | -12%    | weaker than round 1             |
| card repair | 3     | round 1 without "; Rosetta keeps the others" (from v6)                                                                                                                                                                                           | `023403` | Fixed 6                               | +0.05% / -44%                        | -36%    | weaker than round 1             |

Baselines on the same tune cases and repetitions:

| Prompt      | Baseline run                                                                        |
| ----------- | ----------------------------------------------------------------------------------- |
| gap         | `010702`                                                                            |
| gap-repair  | `010852`                                                                            |
| plan-repair | `023228` for rounds 1 to 3 (first check); `032902` for rounds 4 to 6 (second check) |
| card repair | `023248` (five cases); `032642` on the new set                                      |

Notes on the rounds:

- **Two edits in one round.** Gap rounds 2 and 3 each made two edits (a new or moved rule, and a shorter paragraph or a sentence said twice dropped, to pay for it in tokens). They are logged as one round each; a round that changes one thing would have needed two runs each.
- **Plan repair, second check.** Rounds 1 to 3 were scored on the first check, which read `Fixed` for every answer. Round 2 was scored again on the second check: tune `033055`, Shrunk 4, Open 2, gap round 5 of 6 (v2: the same labels, gap round 6 of 6). Rounds 4 to 6 started again from v2 and target what the second check found: v2 drops cards that are not requirements, and leaves requirements no task lists. Their output rises because the answers keep more (more `sources` and task requirements); the latency follows the output.

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

### plan-repair round 5 against v2 (kept as `plan-repair.v3`)

Second check, the whole held-back side (2 cases) on each model.

| Model  | Selection, reps | Current v2 (run)                                                                       | Round 5 (run)                                                                      | Finding                                                                                      |
| ------ | --------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Haiku  | held-back, 3    | Fixed 1, Open 2, Shrunk 3; gap round 4 of 6; 12499 / 5187; 21.3 s; $0.00350 (`033306`) | **Fixed 5**, Shrunk 1; gap round 0 of 6; 12588 / 5938; 24.1 s; $0.00389 (`034936`) | not usable 3 to 1, gap round 4 to 0; input +0.7%, output +14.5%, latency +12.9%, cost +11.1% |
| Sonnet | held-back, 1    | Shrunk 2; gap round 1 of 2; 12498 / 2082; 12.5 s; $0.0452 (`035017`)                   | **Fixed 2**; gap round 0 of 2; 12589 / 2103; 13.6 s; $0.0389 (`035047`)            | not usable 2 to 0, gap round 1 to 0; input +0.7%, output +1.0%, latency +9.0%, cost -14%     |
| Opus   | held-back, 1    | Fixed 1, Open 1; gap round 1 of 2; 12494 / 3472; 29.2 s; $0.118 (`035148`)             | **Fixed 2**; gap round 0 of 2; 12584 / 3717; 30.0 s; $0.110 (`035251`)             | gap round 1 to 0; input +0.7%, output +7.1%, latency +2.6%, cost -7%                         |

**Kept** under DEC-235 read with DEC-237: on every model there is no regression on validity (first try 100% on each side), on labels that are not usable or on follow-ups; there is a quality gain (fewer unusable answers on Haiku and Sonnet, fewer gap rounds on all three); and input, output, latency and cost are each up by at most 15% (the largest is Haiku output, +14.5%). It lands as `prompts/planner/plan-repair.v3.md` (v2 plus the two rules of rounds 4 and 5); the loader `loadPlanRepairPrompt` names it, the manifest test and `plan-repair-prompt-file.test.ts` pin it, and v2 stays loadable.

Limits of the keep:

- The output margin on Haiku is narrow (+14.5% against 15%). The answers write more because they keep more cards and task requirements, which is the gain, and the lab cannot set it apart from the cost.
- The held-back side is two cases (DEC-234); Sonnet and Opus ran it once.
- The lab does not replay a run's `better()` choice between the first plan answer and its repair, nor the gap round the run would send.

### plan-repair round 2 against v2 (first check)

| Model | Selection, reps | Current (run)                            | Candidate (run)                          | Finding                                  |
| ----- | --------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Haiku | held-back, 3    | Fixed 6; 12499 / 5351; 22.0 s (`024528`) | Fixed 6; 12410 / 5355; 21.7 s (`024742`) | input -0.7%, output +0.1%, cost the same |

**Not kept**: there is no quality gain, so the strict rule applies, and output rose by 4 tokens a call. On the second check it is worse than v2 on Haiku held-back (`033501`: Shrunk 5, LeftOut 1, gap round 6 of 6, against `033306`). It was not run on Sonnet or Opus.

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

### card repair round 1 against v6, on the set with the `-nojson` cases (second fix round)

The orchestrator ruled that DEC-235(b) counts fewer unusable answers as a quality gain and that DEC-237 asks only for no regression on every model, so the input rise above alone would not stop a keep; it asked first for the cases where the earlier answer is not JSON. With those cases (`cards-repair-2`, held-back side 6 cases), matched runs:

| Model  | Selection, reps | v6 (run)                                                    | Round 1 (run)                                                                                                 | Finding                                                                           |
| ------ | --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Haiku  | held-back, 3    | Fixed 18; first try 18 of 18; 8892 / 771; 3.28 s (`033617`) | Fixed 15, **Dropped 1, Unusable 2**; first try 16 of 18; second repair 2 of 18; 8905 / 613; 2.80 s (`033711`) | **regression**: the two `Unusable` answers are `{"cards": []}` on `-nojson` cases |
| Sonnet | held-back, 1    | Fixed 5, Dropped 1; 8894 / 603; 4.07 s (`033738`)           | Fixed 5, Dropped 1; 8903 / 472; 3.65 s (`033803`)                                                             | no quality change; input +0.1%, output -22%                                       |
| Opus   | held-back, 1    | Fixed 6; 8891 / 760; 6.70 s (`033846`)                      | Fixed 6; 8909 / 568; 4.92 s (`033919`)                                                                        | no quality change; input +0.2%, output -25%                                       |

On tune (`032642` against `032711`) both read Fixed 9, with output -38%.

**Not kept**: it regresses on Haiku, which writes no card at all when the earlier answer is prose and the request says to write again only the cards a problem is about. This is the loss P10-09's lesson warns about, and the new cases catch it. `cards/repair.v6` stays current; no `repair.v7` lands.

### Best candidates, not kept

- **gap round 3.** The full change is in section 3.
- **gap-repair round 2.** Grouping module copies saves output on tune but drops or mis-names an id about once in six held-back answers.
- **plan-repair round 2.** It is noise-level: a trim that does not move the output, and worse on the second check.
- **card repair round 1.** It cuts the output by a quarter to a half on every model, but on Haiku it writes no card after an earlier answer that is not JSON. The full text of the draft is v6 with that one sentence replaced. A next round would keep "Keep the cards that were correct." for an answer with no readable card and try the shorter request only where some card was read; it was not run.

## 5. The three-round rule and what was not done

**Three Haiku rounds per prompt (the done-when that P10-07 shares with P10-05):**

| Prompt      | Rounds                                              | Kept                       |
| ----------- | --------------------------------------------------- | -------------------------- |
| gap         | 3 (rounds 2 and 3 with two edits each)              | none                       |
| gap-repair  | 3                                                   | none                       |
| plan-repair | 6 (1 to 3 on the first check, 4 to 6 on the second) | `plan-repair.v3` (round 5) |
| card repair | 3 (round 1 measured again on the new set)           | none                       |

Every prompt met the rule. The kept `plan-repair.v3` had its rounds before it was kept (rounds 4 to 6 on the check it is kept under), so no further round is owed.

**Not done:**

- Only `plan-repair.v3` landed; `gap.v6`, `gap-repair.v4` and `cards/repair.v6` stay current, with no new prompt file.
- The four `-nojson` cases are the only cases added; none was re-captured (DEC-236).
- No judge call was made, and no card scope was judged.
- The plan repair round 5 was not run on the tune side of Sonnet or Opus (only the matched held-back runs).
- A run's real repair rate needs a plan run: the end-to-end check of P10-11. It should confirm that `plan-repair.v3` keeps the cards and the task requirements in a run, and that its longer answers stay within the planner's output limit.
