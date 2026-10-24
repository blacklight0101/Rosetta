# Planner fixtures

`data-model-long-field.json` is a hand-written data-model answer of the planner, in the shape the data-model prompt asks for. It has three tables and one legacy field of 113 characters, to test that one over-long field drops only its own column (EV-02, RF-623). It describes no real application, workbook or organisation, and copies no text from anywhere.

## Provenance (RNF-009)

Written by hand for this repository by the Rosetta contributors and covered by the repository's MIT licence.

Nothing here comes from the owner's employer (DEC-03).

## large-understand-shape.json (P3-113, EV-29)

The shape of a large understand: the 371 supported cards of the Deepen run of a public sample, Microsoft's eShopModernizing (MIT licence), as lengths only: for each card its type, the index of its area in `areas`, the lengths of its title and summary, and for each supported claim the length of its text and its number of citations. No text of the run or of the repository is kept; `tests/support/large-understand.ts` writes filler words of those lengths. It is there so a test can plan from a project whose cards, unpacked, are larger than the 131,072-token window of a local model.

## data-model-sqlserver-orders-wrong.json and data-model-sqlserver-orders-right.json (P3-120)

Hand-written data-model answers for a synthetic project: SQL strings against `tblOrders(id int, status_id int, ...)`, a `tblStatus` table and a rule "status 6 means deleted", planned under SQL Server. The first is the answer of the failing kind (PostgreSQL types, a uuid key, no `status_id`, no status table); the second is a right one. They describe no real application and copy no text from anywhere.

## data-model-clinic-staff-wrong.json (P5-37)

A hand-written data-model answer of the failing kind for a synthetic `Staff` table (see `tests/support/data-model-column-facts.ts`): a float kept as an integer, NOT NULL dropped, a default lost, a float changed to numeric with a stated reason, and a type of another database. It describes no real application and copies no text from anywhere.
