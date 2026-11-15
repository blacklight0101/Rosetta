# Plan coverage: behaviour kept by no card (P10-14)

Status 2026-11-15 (fix round 1): **fixed in code, no prompt changed.** The cause of P10-D6 is in the code that decides which behaviour a task card keeps, not in a prompt, so no lab round was run. The eShopModernizing re-plan on the `rosetta-p10` stack is **pending**: the stack's server month cap stopped it (section 4).

Only aggregate figures and card ids of the public eShopModernizing sample are written here. The Asset Manager and Invoice packages were not opened; their counts are those of `end-to-end.md`.

## 1. The defect

P10-11 (`end-to-end.md`, P10-D6): the eShop `checks.md` section "Behaviour kept by no card" grew from 14 items of 2 source cards (P8w3, 2026-11-09) to 98 items of 13 cards (`FEAT` 10 cards with 91 items, `FLOW` 1 with 5, `BR` 2 with 2), while the coverage summary above it read "Every feature, table, operation, journey and screen is built by at least one task card".

## 2. The cause

A task card keeps the supported claims of the `FEAT`, `BR`, `FLOW` and `SCRN` cards that its requirements cite (RF-631). Two rules then take claims away, and a claim that every card loses is "kept by no card":

1. **The narrowing of P5-41** (`src/domain/planning/behaviours-to-keep.ts`, `inScope`). A task that builds a feature item keeps a `FEAT` card only when one of its built features traces to that card (the feature's own source cards in `prd.md`). A `FEAT` card that a requirement cites but **no feature of the PRD traces to** can then be kept only by a task that lists the requirement and builds no feature at all. Nearly every task that lists a requirement builds a feature (the gap round of P9-06 gives each gap card the requirement behind what it builds, and P5-40 gives a card the feature of a requirement it lists), so such a card's claims fall out of every card.
2. **The migrations card** (`src/domain/planning/plan-coverage.ts`, `migrationCard`). The card that writes the migrations lists every requirement that cites a source card of a table, and keeps only the business rules that name its tables (RF-631). A requirement that cites a table's entity card **and** a feature card counted as built by it (`coverageOf`), so the gap round of P9-06 never asked for a card for it, and its feature claims were kept by no card.

The P10-11 eShop package, card by card (ids from `checks.md`, `requirements.md`, `prd.md` and `tasks.md`; a scratch script, not in the repository, counted them):

| Cause                                          | Source cards                                                                             | Items  | Who lists the requirement                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `FEAT` card no PRD feature traces to           | FEAT-003, FEAT-036, FEAT-041, FEAT-052, FEAT-063, FEAT-068, FEAT-069, FEAT-080, FEAT-128 | 60     | 1 to 3 cards each, every one building other features (for 5 of the 9, only a gap card of `gap.v6`) |
| Requirement listed only by the migrations card | FEAT-056, BR-042, BR-068 (REQ-023, which also cites two entity cards)                    | 33     | the migrations card                                                                                |
| `FLOW` card of a journey out of scope          | FLOW-004                                                                                 | 5      | a card that builds other journeys; `flows/README.md` gives the reason it is out of scope           |
| **Total**                                      | 13                                                                                       | **98** |                                                                                                    |

P8w3's 14 items were both of the first kind (FEAT-070, 4 items; FEAT-023, 10 items).

**A second P10 run: the variance.** The P10-13 journeys re-ran eShop end to end on the rebuilt `rosetta-p10` stack on 2026-11-15, with the planner code of P10-11 (before this fix). That plan has 38 task cards (against 28), 46 item builds (1.2 per card), 28 requirements, and 44 items of 3 cards kept by no card (against 98 of 13). The same causes explain all 44:

- 40 items of two `FEAT` cards that no PRD feature traces to (FEAT-010, 9 items, on a card that builds other features; FEAT-051, 31 items, on three such cards). There, 11 of 19 cited `FEAT` cards have no feature.
- 4 items of FLOW-002, a journey out of scope with its reason.
- No requirement was left to the migrations card: it lists one with a feature card behind it, but another card lists that requirement too.

So the count moves by a factor of two between two Haiku journeys of the same code on the same source (each with its own understand and Deepen, so the cards differ too); the spread (14, 44, 98) is mostly how many cited `FEAT` cards the PRD leaves untraced and which cards list their requirements. A single re-plan is read against that spread, not against 98 alone. By the same count, this fix would leave 4 of the 44 (FLOW-002).

**Why it grew.** The eShop requirements cite more `FEAT` cards that no PRD feature traces to: 15 of 27 cited `FEAT` cards in P10-11 against 10 of 20 in P8w3. Before P9-06 (EV-108, `planner/gap.v6`, commit `a19858f72`, between `bbb696cd8` and `cb146766a`), a requirement that no card listed did not count in "Behaviour kept by no card" at all (`behavioursKeptByNoCard` starts from the requirements cards list): its behaviour was hidden behind "Requirements built by no card" (2 requirements in P8w3). P9-06 makes every requirement listed by some card, so all of its cited behaviour now enters the check, and the narrowing removes the part no built feature traces to. Fewer, larger task cards (28 at 1.9 items against 35 at 2.5) make more cards build some feature, which is what turns the narrowing on; they are a contributing factor, not the cause. The planner's coverage check never saw behaviour: its items are features, tables, operations, journeys, screens and requirements, and a requirement counts as built when any card, the migrations card included, lists it.

## 3. The fix (code, RF-627, RF-631, RF-623)

- **One task keeps a `FEAT` card no feature traces to** (`inScope` in `behaviours-to-keep.ts`, the owner from `untracedFeatureOwners` in `untraced-features.ts`). The owner is the task that lists the most requirements citing the card, then the one that builds the fewest items, then the first in plan order. It is never the migrations card. When a task that lists such a requirement builds no feature, that task keeps the card already and no owner is named. The narrowing still applies to a `FEAT` card some feature traces to. It also still applies to a `FLOW` or `SCRN` card that no target journey or screen traces to, since the flows or the UX document left those out with a reason.
- **The migrations card never lists a requirement with a `FEAT`, `FLOW` or `SCRN` card behind it.** `migrationCard` does not give it one, and `alignTask` in `requirement-alignment.ts` (the DEC-160 alignment that `checkedPlan` runs after the coverage call and after each gap round) never adds one back. The first version of this fix changed only `migrationCard`, and the alignment re-added the requirement (verifier finding F1). Such a requirement, if no other card lists it, is a `requirement:<REQ id>` item of the gap rounds. A requirement that cites only entity and rule cards stays on the migrations card.
- **`checks.md` names the gap under "Plan coverage"**: "Not every behaviour of the source is kept: N behaviours of M source cards are kept by no card, and K feature cards reach no requirement (see ...)". It changes no outcome of the run (RF-631: the owner decides whether a card must build it).
- **P10-D7** (`data-model-answer.ts`, `data-model-named.ts`): a dropped claim's `field` may be up to 300 characters, so an entry that lists several fields in one text is kept (P10-11: 7 entries of 107 to 144 characters were rejected by the 80-character name limit). The data-model name check splits such an entry at commas, semicolons, slashes and "and", so each field it lists counts as dropped.

Tests (red commits `f5d38706b` and `d15c23291`):

- `behaviours-unnamed-feature.test.ts`: the owner rule.
- `migration-card-requirements.test.ts`: `withMigrationCard` and `alignRequirements`.
- `plan-gap-migration-requirement-recorded.test.ts`: the whole coverage path with the recorded eShop gap answers, from the migrations card through the alignment to both gap rounds and the check after each. When the gap card builds the requirement, the plan completes; when none does, the run ends RST-1806.
- `render-behaviour-gaps.test.ts`: the `checks.md` line.
- Cases in `data-model-answer.test.ts` and `data-model-named.test.ts`.

**RST-1806 risk.** A plan can now end RST-1806 where it completed before. This happens when a requirement cites the source card of a table and any `FEAT`, `FLOW` or `SCRN` card (traced by a feature or not), no card of the planner lists it, and neither gap round (with the first round's repair) writes or links a card for it. Before this card, such a requirement counted as built by the migrations card, and its behaviour was silently kept by no card.

- **Exposure.** On the two eShop packages this applies to one requirement in P10-11 (REQ-023 of the 3 the migrations card listed) and to none in P8w3 (1 listed, no behaviour card). Asset Manager and Invoice were not checked, since their packages stay closed.
- **Odds.** The gap rounds build requirement items well: the P10-11 eShop gap call built all 10 it was sent. So the risk is low but real, and highest on a weak local model. The package is still written, `checks.md` names the requirement under "Requirements built by no card", and the owner can write the package again.
- **No guard against it.** The requirement cites behaviour that no card would keep, so the run reports it rather than completing over it. The owner may prefer a softer outcome (see the DEC question in the PR).

**Card growth (verifier finding F3).** The first version kept an untraced `FEAT` card on every card that lists its requirement. That repeated claims and grew the P10-11 cards from 622 behaviour items to about 738, and duplicated cards a no-feature task already kept. The owner rule adds each card once. The same scratch count (ids and counts only, from `tasks.md`, `requirements.md`, `prd.md` and `checks.md`) gives these expected figures; the re-plan checks them:

| P10-11 card | Items it builds | Behaviour items now | Every lister (first version) | One owner (this fix) |
| ----------- | --------------- | ------------------- | ---------------------------- | -------------------- |
| T-005       | 8               | 101                 | 125                          | 101                  |
| T-007       | 5               | 48                  | 77                           | 62                   |
| T-009       | 1               | 20                  | 32                           | 32                   |
| T-013       | 1               | 12                  | 18                           | 18                   |
| T-017       | 4               | 43                  | 56                           | 43                   |
| T-018       | 4               | 48                  | 52                           | 52                   |
| T-019       | 4               | 42                  | 57                           | 53                   |
| T-021       | 3               | 51                  | 64                           | 64                   |
| **All 28**  |                 | **622**             | **738**                      | **682**              |

The REQ-023 gap card adds its own 33. On P8w3 the owner rule gives 1214 to 1228: FEAT-070 to T-018, which builds 3 items, rather than also to T-009 (8 items) and T-027; FEAT-023 to T-016. No card that a no-feature task already keeps is repeated.

**Expected effect** (by the same count, not measured): P10-11 **98 to 5**. The owner rule keeps the 60 items of the nine `FEAT` cards. REQ-023 goes to the gap round, and a gap card that lists it keeps FEAT-056 and both rules (33 items) if the round builds it. The 5 items of the out-of-scope journey FLOW-004 stay listed. If no gap card builds REQ-023, the run ends RST-1806 with 38 items kept by no card. P8w3: **14 to 0**. A re-plan gives other cards, so the real run (section 4) is the measure.

## 4. Real run

**Not yet measured: the stack's server month cap stopped the re-plan.**

- `rosetta-p10` was rebuilt from this branch at `5256ddab4` (image created 2026-11-15 11:07 UTC, volumes kept) and is left running on that build.
- The eShop plan was started on Haiku from the P10-11 Deepen (`20261114-130936-understand`), with the P10-11 brief and plan options.
- Run `20261115-110852-plan` ended `CapReached` (RST-1600) after 3 calls and $0.4765, on the server month cap of $5.60 that P10-11 set as a hard guard ($5.594 spent on the stack).
- The run's three answers (package, PRD, data model) are kept, so a resume after the cap is raised does not pay for them again.
- Still to report: "Behaviour kept by no card" (98 to ?), the task cards, the item builds and the judge-free plan stats (`p7-planstats.mjs`) against P8w3, P10-11 and the P10-13 run.

The baselines, judge-free (the P10-14 column is filled by the re-plan):

| eShop plan | P8w3 (2026-11-09) | P10-11 (2026-11-14) | P10-13 run (2026-11-15) | P10-14 |
| ---------------------------------------- | ----------------- | ------------------- | ------ |
| Behaviour kept by no card, items (cards) | 14 (2) | 98 (13) | - |
| Task cards | 35 | 28 | - |
| Item builds (mean per card) | 88 (2.5) | 54 (1.9) | - |
| Cards that build no item | 10 | 11 | - |
| Requirements (mean per card) | 25 (2.2) | 30 (1.9) | - |
| Size M / L / S | 20 / 15 / 0 | 14 / 12 / 2 | - |
| Feature cards that reach no requirement | 58 | 56 | - |
| Data-model dropped entries rejected | 0 | 7 | - |

## 5. Spend

$0.4765 of the card's $2.00, all on the stack (the capped plan run above); no lab run (no prompt changed).
