# Plan golden fixtures

`data-model-package.sha256.json` holds one SHA-256 per file of the hand-off package of a plan that has a data
model, for each of the three migration strategies (P6-27, RF-610). The package is written from the seeded
understand run of the plan tests (`tests/support/plan-cards.ts`, two `ENT` cards) and the recorded planner answer
`tests/recordings/fake/planner-package.json`; no provider is called (ADR-008). The hashes were taken before the data
cards could be dropped, and `build-plan-golden-package.test.ts` compares a fresh package with them, so a plan with a
data model keeps its package byte for byte. When a change meant to alter the package lands, the file is written
again from the test support (`tests/support/package-hashes.ts`) in the same change, and the change says why. The hashes were regenerated after P6-31 changed `open-questions.md`;
only its entries changed. They were regenerated again after P7-11 wrote the name of a left-out part of `checks.md` as a code span; only `checks.md` changed.
They were regenerated again after P7-13 added the "Data model" section to `checks.md`: the recorded answer has one column typed "to confirm" (`note` of `customer_order`, a type that is not a type name), which `checks.md` now lists in that section; only `checks.md` changed, in each of the three strategies, and every other file keeps its hash.

## Provenance (RNF-009)

The hashes were computed by this repository's own code from synthetic cards and a hand-written recording. They hold
no source text, no real user, no provider key and no run record, and are covered by the repository's MIT licence.

Nothing here comes from the owner's employer (DEC-03).
