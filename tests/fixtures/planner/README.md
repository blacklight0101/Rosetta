# Planner fixtures

`data-model-long-field.json` is a hand-written data-model answer of the planner, in the shape the data-model prompt asks for. It has three tables and one legacy field of 113 characters, to test that one over-long field drops only its own column (EV-02, RF-623). It describes no real application, workbook or organisation, and copies no text from anywhere.

## Provenance (RNF-009)

Written by hand for this repository by the Rosetta contributors and covered by the repository's MIT licence.

Nothing here comes from the owner's employer (DEC-03).

## large-understand-shape.json (P3-113, EV-29)

The shape of a large understand: the 371 supported cards of the Deepen run of a public sample, Microsoft's eShopModernizing (MIT licence), as lengths only: for each card its type, the index of its area in `areas`, the lengths of its title and summary, and for each supported claim the length of its text and its number of citations. No text of the run or of the repository is kept; `tests/support/large-understand.ts` writes filler words of those lengths. It is there so a test can plan from a project whose cards, unpacked, are larger than the 131,072-token window of a local model.
