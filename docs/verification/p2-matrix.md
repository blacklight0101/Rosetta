# Phase 2 verification matrix

|                     |                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Card**            | P2-14 (RNF-005, RNF-006)                                                                                                                                                                         |
| **Date**            | 2026-10-26                                                                                                                                                                                       |
| **Commit reviewed** | `main` at `89c91e79` (after #930 and #894; the tests as at `ff3ddd06`, #894 changes only the packages)                                                                                           |
| **Reviewer**        | builder-opus (Claude), for the owner BlackLigth (blacklight0101)                                                                                                                                 |
| **Inputs**          | the [requirements](../spec/requirements.md), the [roadmap](../roadmap.md) P2 backlog row and exit criteria, RFC-001 section 7, [tasks](../orchestration/tasks.md), the [R1 matrix](r1-matrix.md) |

This is the evidence for the phase 2 exit (P2 Full understand): every requirement of the roadmap's P2 backlog row
with the tests that name it, the golden-set result against the success criteria of RFC-001 section 7, the owner's
hands-on review, and the gaps with their follow-up cards. It narrows the [R1 matrix](r1-matrix.md) of 2026-10-19 to
phase 2 and brings it up to the commit above; it does not repeat its method notes, its journeys or its security
review.

## 1. Summary

| Item                                 | Result                                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 requirements in scope        | 22: 9 Must, 10 Should, 3 non-functional (the P2 row of the roadmap backlog; RF-425 is in scope for its second scenario, and its count includes the tests of the first) |
| With tests that name them            | 22 of 22                                                                                                                                                               |
| Must without evidence                | none                                                                                                                                                                   |
| Phase 2 cards                        | P2-01..P2-41 Done (P2-12 since #930, P2-14 with this matrix); follow-up cards P2-46 and P2-47 added by this card (section 5)                                           |
| Golden set against RFC-001 section 7 | precision, recall, citation validity, coverage, cost, scan time and repeatable tests met; estimate accuracy **not met**                                                |
| Owner hands-on review                | held as the owner's evaluations and package reviews of 2026-10-22 to 2026-10-26, each with its changes recorded (section 4)                                            |
| Pyramid                              | Unit 12990 / Integration 5404 / E2E 268 (70% / 29% / 1%) in the CI run of #930 (section 6)                                                                             |

## 2. Requirement matrix

Columns: the priority (NFR for a non-functional requirement), the test count per level (unit / integration /
end-to-end), one example and the state. A test counts for a requirement when its own title carries the id or a range
that holds it. The counts come from `vitest list` and `playwright test --list` on the commit above, so a test that
names the id only in its `describe` title is not counted, and some numbers are lower than in the R1 matrix. "Tests
pass" means that the CI run of #930 on the same content passed: `npm run verify` on Windows and Linux and the three
end-to-end shards.

| Id      | Requirement                                        | Priority | Tests U / I / E | Example                                                                                   | State                                                                                                                                          |
| ------- | -------------------------------------------------- | -------- | --------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-006  | Resume a stopped run                               | Should   | 58 / 40 / 4     | `tests/e2e/journeys/cap-resume.spec.ts:52`                                                | Tests pass                                                                                                                                     |
| RF-144  | Limit excerpt size                                 | Should   | 13 / 2 / 0      | `tests/integration/infrastructure/files/node-repository-reader-grow.test.ts:66`           | Tests pass                                                                                                                                     |
| RF-230  | Coverage per area                                  | Must     | 54 / 10 / 0     | `tests/integration/application/understand-bookkeeping.test.ts:14`                         | Tests pass                                                                                                                                     |
| RF-241  | Re-run with answers                                | Must     | 52 / 31 / 3     | `tests/e2e/journeys/full-understand.spec.ts:100`                                          | Tests pass                                                                                                                                     |
| RF-250  | Consolidate cards across areas                     | Should   | 84 / 33 / 1     | `tests/e2e/journeys/consolidation.spec.ts:43`                                             | Tests pass                                                                                                                                     |
| RF-260  | Flow cards                                         | Must     | 66 / 17 / 0     | `tests/integration/application/understand-flows-incomplete.test.ts:39`                    | Tests pass                                                                                                                                     |
| RF-261  | Screen cards                                       | Must     | 55 / 7 / 0      | `tests/integration/application/understand-flows-screens.test.ts:80`                       | Tests pass                                                                                                                                     |
| RF-262  | Legacy data model                                  | Must     | 38 / 5 / 1      | `tests/e2e/journeys/consolidation.spec.ts:43`                                             | Tests pass                                                                                                                                     |
| RF-263  | Flows, screens and data model in the specification | Must     | 12 / 4 / 0      | `tests/integration/application/understand-flows-screens.test.ts:149`                      | Tests pass                                                                                                                                     |
| RF-301  | Judge each claim against its evidence              | Must     | 33 / 42 / 3     | `tests/e2e/journeys/cap-resume.spec.ts:52`                                                | Tests pass                                                                                                                                     |
| RF-303  | Verification summary                               | Must     | 17 / 0 / 0      | `tests/unit/domain/cards/verification-summary.test.ts:22`                                 | Tests pass                                                                                                                                     |
| RF-304  | Leave claims unverified when stopped               | Should   | 4 / 18 / 0      | `tests/integration/application/understand-flows-incomplete.test.ts:81`                    | Tests pass                                                                                                                                     |
| RF-305  | Calibrate the verifier                             | Should   | 14 / 19 / 0     | `tests/integration/infrastructure/eval/calibration-set-file.test.ts:34`                   | Tests pass                                                                                                                                     |
| RF-403  | OpenAI-compatible adapter                          | Should   | 2 / 4 / 0       | `tests/integration/infrastructure/providers/openai/openai-compatible-contract.test.ts:27` | Tests pass                                                                                                                                     |
| RF-404  | Anthropic adapter                                  | Should   | 4 / 25 / 0      | `tests/integration/infrastructure/providers/anthropic/anthropic-answers.test.ts:19`       | Tests pass                                                                                                                                     |
| RF-423  | Cap per role                                       | Should   | 29 / 9 / 0      | `tests/integration/application/build-plan-caps.test.ts:97`                                | Tests pass                                                                                                                                     |
| RF-425  | Estimate before running (second scenario)          | Must     | 83 / 8 / 2      | `tests/e2e/start-run-confirm.spec.ts:55`                                                  | Tests pass; the accuracy of the estimate is the target of RNF-012, card P2-46                                                                  |
| RF-427  | Unpriced models                                    | Should   | 52 / 6 / 0      | `tests/integration/application/understand-summariser-role.test.ts:48`                     | Tests pass                                                                                                                                     |
| RF-1306 | Backups                                            | Should   | 19 / 27 / 0     | `tests/integration/docs/deploy-runbook.test.ts:160`                                       | Tests pass; the hosted restore drill was reported done by the owner on 2026-10-26 (P2-12)                                                      |
| RNF-006 | Measured quality                                   | NFR      | 33 / 13 / 0     | `tests/integration/infrastructure/eval/evaluation-files.test.ts:98`                       | Tests pass; the live evaluation of 2026-10-25 meets the precision, recall and citation targets (section 3); entity relations now scored, P2-47 |
| RNF-012 | Estimate accuracy                                  | NFR      | 8 / 2 / 0       | `tests/integration/infrastructure/eval/run-claims.test.ts:95`                             | Tests pass; **not met** in the live evaluation (the estimate was 64 % above the actual cost), card P2-46                                       |
| RNF-015 | Evaluations are experiments                        | NFR      | 26 / 8 / 0      | `tests/integration/infrastructure/eval/evaluation-files.test.ts:54`                       | Tests pass; the live evaluation ran each case 3 times and reports the spread (section 3)                                                       |

## 3. Golden set against the success criteria

The first live evaluation ran on 2026-10-25 (card P2-34): `npm run eval -- --yes`, golden set 2026-10-17.2 on
`dotnet-architecture/eShopModernizing` at `63bc9ec4`, three runs, Claude Haiku 5.5 on the reader, verifier and
summariser roles. The output folder `eval-out/20261025-092418-eval/` is kept locally and git-ignored; the figures are
in the `handoff.md` resume entry of 2026-10-25. Values are the mean, with the range of the three runs.

| RFC-001 metric                  | Target                                                     | Result                                                                                  | Met                      |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------ |
| Claim precision on the demo app | at least 90 % of `Supported` claims correct                | 0.991 (0.986-1.000)                                                                     | yes                      |
| Recall of known business rules  | at least 70 % of golden-set rules found                    | 0.867 (0.850-0.900); 0.911 counting every golden rule                                   | yes                      |
| Citation validity               | 100 % of citations in `Supported` claims valid             | 1.000                                                                                   | yes                      |
| Coverage                        | every file of an analysed area read or listed as skipped   | the run coverage table (RF-230, section 2); the evaluation does not score it            | yes, by the RF-230 tests |
| Cost of a full demo run         | under 1 USD with the cheapest cloud model; 0 USD on Ollama | 0.081 USD a run (0.078-0.086) on Haiku 5.5; Ollama calls are priced at 0 (RF-426)       | yes                      |
| Estimate accuracy               | actual cost within 30 % of the estimate                    | the estimate was 64 % above the actual cost; 0 of 3 runs within 30 %                    | **no**, card P2-46       |
| Scan time                       | under 10 seconds for the demo app                          | 1.5 s of scan time for eShopModernizing, 887 files ([M1 matrix](m1-matrix.md), RNF-007) | yes                      |
| Repeatable tests                | the full suite passes with no network                      | the suite uses the fake provider only (RNF-005, ADR-008); the CI run of #930 passed     | yes                      |

Results the RFC does not target: strict precision 0.429 (0.393-0.487), because 0.567 of the `Supported` claims are
not in the golden set and count as unchecked; relation precision of entity cards 0.000 (two runs measured), because
golden set 2026-10-17.2 held no relation while the readers did write them; card P2-47 added two (2026-10-27.1,
`golden-relations.test.ts`), and a live run re-measures it; flow step and screen field recall were not measured. The
verifier shared the reader's model family, so the run
log warns about self-preference (RF-305). The caps of `eval/config.json` refused every configuration on its high
estimate (RST-1600), and the owner raised them for this run only, in a local copy; that is the same estimate gap as
card P2-46.

## 4. Owner hands-on review

The phase 2 review was held as the owner's own runs and reviews at the end of the phase. Each one is recorded with its
changes:

| Date       | Review                                                                                    | Changes recorded                                        |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 2026-10-22 | evaluation on local Ollama (three Excel workbooks)                                        | DEC-165; cards P3-101..P3-107 and P1-182                |
| 2026-10-23 | evaluation passes 2 and 3, and the Haiku 5.5 battery                                      | DEC-166..DEC-170; cards P3-108..P3-128                  |
| 2026-10-24 | review of a sample hand-off package and a log check                                       | DEC-172; cards P5-20..P5-33                             |
| 2026-10-25 | the owner's own package test (campaign-manager zip, Sonnet) and the first live evaluation | DEC-173 (phase 6, P6-01); cards P3-132, P2-46 and P2-47 |
| 2026-10-26 | answer on the open item of the 2026-10-17 security audit (#513)                           | DEC-174 (the `host.docker.internal` risk is accepted)   |

## 5. Gaps and follow-up cards

| Id      | Priority | What is missing                                                                             | Card  | Card state |
| ------- | -------- | ------------------------------------------------------------------------------------------- | ----- | ---------- |
| RNF-012 | NFR      | the estimate within 30 % of the actual cost on the demo app (live: 64 % above, 0 of 3 runs) | P2-46 | Todo       |
| RNF-006 | NFR      | entity relations right in ENT cards (live relation precision 0.000)                         | P2-47 | Done       |

No Must lacks evidence. Item 4 of the 2026-10-17 security audit (#513: count `host.docker.internal` as local only
inside a container) is not a gap: the owner accepted the risk (DEC-174), and RF-143 and DEC-118 stand.

## 6. Pyramid

`npm run verify` (its `test-levels` step, `scripts/test-levels.mjs`) in the CI run of #930, job
`tests (ubuntu-latest)`: **Unit 12990 / Integration 5404 / E2E 268**, shares 70% / 29% / 1% against the target
60% / 30% / 10% with 10 points of tolerance (DEC-30). Every share is inside the tolerance; the unit share (69.6%)
is at its edge. The end-to-end share is low by count, as in the R1 matrix, because each Playwright journey covers
many requirements at once. Since the R1 matrix (Unit 8897 / Integration 3943 / E2E 232) the suite grew by 4093
unit, 1461 integration and 36 end-to-end tests.
