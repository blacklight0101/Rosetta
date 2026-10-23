# Plan answer fixtures

`ev01-index-positions.json` is a planner answer of the 2026-10-22 evaluation (EV-01), trimmed to the requirements its
task cards cite, its four phases and its seven task cards, with the lists it does not read left empty. The cards
write their requirement positions as `{"index": N}`, which the answer reader must accept (P3-101). The unit test
`plan-answer.test.ts` reads it and expects its seven cards to assemble.

## Provenance (RNF-009)

The answer was written by a local model during the evaluation run and was trimmed by hand for this repository; it
is covered by the repository's MIT licence. It describes a generic legacy workbook system and holds no real user,
provider key or run record.

Nothing here comes from the owner's employer (DEC-03).

`eshop-string-positions.json` is a planner answer of the 2026-10-23 evaluation (EV-30) for the public
eShopModernizing project, trimmed to its first 24 requirements, its four phases and its first six task cards, with the
lists it does not read left empty. Its cards write their requirement positions as strings (`"1"`, `"12"`), which the
answer reader reads as numbers (P3-114). The unit test `plan-answer.test.ts` reads it and expects its six cards to
assemble.

Provenance (RNF-009): the answer is the assistant message of the run `p2-eshop-plan2` (planner package, local model);
the source it was planned from is the eShopModernizing project under the MIT licence (its LICENSE file). No real user,
provider key or run record is kept here.
