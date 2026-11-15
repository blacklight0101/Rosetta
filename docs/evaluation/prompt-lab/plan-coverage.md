# Plan coverage: behaviour kept by no card (P10-14)

Status 2026-11-15: **fixed in code, no prompt changed.** The cause of P10-D6 is in the code that decides which behaviour a task card keeps, not in a prompt, so no lab round was run. The eShopModernizing re-plan on the `rosetta-p10` stack is **pending stack** (section 4).

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

**Why it grew.** The eShop requirements cite more `FEAT` cards that no PRD feature traces to: 15 of 27 cited `FEAT` cards in P10-11 against 10 of 20 in P8w3. Before P9-06 (EV-108, `planner/gap.v6`, commit `a19858f72`, between `bbb696cd8` and `cb146766a`), a requirement that no card listed did not count in "Behaviour kept by no card" at all (`behavioursKeptByNoCard` starts from the requirements cards list): its behaviour was hidden behind "Requirements built by no card" (2 requirements in P8w3). P9-06 makes every requirement listed by some card, so all of its cited behaviour now enters the check, and the narrowing removes the part no built feature traces to. Fewer, larger task cards (28 at 1.9 items against 35 at 2.5) make more cards build some feature, which is what turns the narrowing on; they are a contributing factor, not the cause. The planner's coverage check never saw behaviour: its items are features, tables, operations, journeys, screens and requirements, and a requirement counts as built when any card, the migrations card included, lists it.

## 3. The fix (code, RF-627, RF-631, RF-623)

- **A `FEAT` card no feature traces to is not narrowed away** (`inScope`): the tasks that list a requirement citing it keep its claims, whatever features they build. The narrowing still applies to a `FEAT` card some feature traces to, and to a `FLOW` or `SCRN` card that no target journey or screen traces to (those were left out with a reason by the flows or the UX document).
- **The migrations card lists no requirement with a `FEAT`, `FLOW` or `SCRN` card behind it** (`migratesRequirement`). Such a requirement, if no other card lists it, is a `requirement:<REQ id>` item of the gap rounds, so a card that keeps its behaviour is asked for, and the run ends RST-1806 if none is written, as for any requirement (P9-06). A requirement that cites only entity and rule cards stays on the migrations card.
- **`checks.md` names the gap under "Plan coverage"**: "Not every behaviour of the source is kept: N behaviours of M source cards are kept by no card, and K feature cards reach no requirement (see ...)". It changes no outcome of the run (RF-631: the owner decides whether a card must build it).
- **P10-D7** (`data-model-answer.ts`): a dropped claim's `field` may be up to 300 characters, so an entry that lists several fields in one text is kept (P10-11: 7 entries of 107 to 144 characters were rejected by the 80-character name limit).

Tests: `behaviours-unnamed-feature.test.ts`, `migration-card-requirements.test.ts`, `render-behaviour-gaps.test.ts`, and two cases in `data-model-answer.test.ts`; every unit test of `domain/planning`, `infrastructure/handoff` and `application/plan` passes unchanged.

**Expected effect on the P10-11 package**, by the same count: the first rule keeps the 60 items of the nine `FEAT` cards; the second sends REQ-023 to the gap round, and a gap card that lists it keeps FEAT-056 (no feature traces to it) and both rules (33 items); the 5 items of the out-of-scope journey stay listed. Expected: **98 to 5** on P10-11's plan, and **14 to 0** on P8w3's. A re-plan gives other cards, so the real run (section 4) is the measure.

## 4. Real run

Pending stack: `rosetta-p10` was busy with the P10-13 journeys. To do when it is free: rebuild it from this branch, re-run only the eShop plan on Haiku from the P10-11 Deepen, and report "Behaviour kept by no card" (98 to ?), the task cards, the item builds and the judge-free plan stats (`p7-planstats.mjs`) against P8w3 and P10-11.

The two baselines, judge-free (the P10-14 column is filled by the re-plan):

| eShop plan                               | P8w3 (2026-11-09) | P10-11 (2026-11-14) | P10-14 |
| ---------------------------------------- | ----------------- | ------------------- | ------ |
| Behaviour kept by no card, items (cards) | 14 (2)            | 98 (13)             | -      |
| Task cards                               | 35                | 28                  | -      |
| Item builds (mean per card)              | 88 (2.5)          | 54 (1.9)            | -      |
| Cards that build no item                 | 10                | 11                  | -      |
| Requirements (mean per card)             | 25 (2.2)          | 30 (1.9)            | -      |
| Size M / L / S                           | 20 / 15 / 0       | 14 / 12 / 2         | -      |
| Feature cards that reach no requirement  | 58                | 56                  | -      |
| Data-model dropped entries rejected      | 0                 | 7                   | -      |

## 5. Spend

$0.00 of the card's $2.00: no lab run (no prompt changed) and no stack run yet.
