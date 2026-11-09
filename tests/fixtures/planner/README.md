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

## data-model-asset-manager-haiku.json, data-model-asset-manager-ollama.json, data-model-eshop-duplicates.json and data-model-invoice-junk.json (P7-13)

Hand-written data-model answers of the failing kind, shaped like the defects of the evaluation of 2026-10-29 and written again in new words for synthetic cards (`tests/support/data-model-defect-cards.ts`: a stock workbook, a catalog service, an invoice workbook; no text of the evaluated projects). The first has `integer`, `numeric` and `varchar` columns on SQL Server and `movement_type varchar(3)` for a list that holds "Opening Stock" (EV-74, EV-75). The second has the columns `metrics_to_derive_status` and `valuation_lookup_range` typed `text` (EV-31, EV-40). The third has `catalog_brand` next to `catalog_brands` (and the same for type and item) and tables for a deployment configuration, a registration, application parameters and a view model, plus a description typed with a sentence. The fourth has tables for the workbook file and its glossary and `text` on SQL Server. They describe no real application, workbook or organisation.

## data-model-site-sheets.json (P7-32)

A hand-written data-model answer for synthetic cards (`siteSheetCards` in `tests/support/data-model-defect-cards.ts`): three per-site sheets of the same four columns (`access_point_site_a`, `_b`, `_c`) and a `tag_list` table with other columns. It describes no real application, workbook or organisation, and copies no text from anywhere.

## eshop-modules-scan.json and eshop-recorded-plans.json (P8-06)

`eshop-modules-scan.json` is the file list of the scan of the public repository `dotnet-architecture/eShopModernizing` (MIT licence, Microsoft) at commit `63bc9ec4414d7e281dc9f9d7bdcf70030950457d`: each file's path, language, line count and artefact kinds, and no file content. `eshop-recorded-plans.json` holds, for the two recorded eShop plans of the evaluation of 2026-11-02 (Haiku and Ollama, EV-32), the task cards with their requirements and expected files, the requirements with their source cards, and the paths those source cards cite; the titles were written by the models from that public repository. No employer text.

## eshop-gap-round-ev95.json (P8-95)

The input of the coverage and gap calls of the first eShopModernizing plan try of the evaluation of 2026-11-02 (Haiku, EV-95), which ended RST-1806 with `FLOW-002`, `FLOW-009`, `FLOW-010` and `FLOW-012` built by no card: the items the coverage call was sent (features with their priority and source card ids, tables, journeys, screens, modules and the deployment material, with the names and details of the call; the deployment detail was cut at 300 characters by the call, so only its whole paths are kept), the phases, the requirement titles with their source card ids, and the planner's three task cards with their phase, requirement positions and Done-when items. `tests/support/eshop-gap-round-fixtures.ts` builds the plan and the documents from it; with the recordings `planner-gap-eshop-ev95*.json` it replays the round. P8-96: `planner-gap-eshop-ev95-second-round.json` and `planner-gap-eshop-ev95-still-open.json` replay the recorded coverage and gap.v4 answers, then a synthetic answer to the second gap round (written for this repository, marked so in each description) that links the four flows to T-004 or writes nothing. The texts were written by the model about the public eShopModernizing (MIT licence); no employer text.
