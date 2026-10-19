# ADR-023: Read Excel workbooks with `yauzl`, `saxes` and `cfb`

**Date**: 2026-10-19
**Status**: Proposed
**Deciders**: BlackLigth (blacklight0101)

## Context

DEC-150 adds Excel workbooks as the third source of a project (RFC-005, RF-150..RF-158). An `.xlsx` or `.xlsm` file is
a zip package of XML parts; the macros of an `.xlsm` sit in `xl/vbaProject.bin`, a compound file (MS-CFB) whose
module streams are compressed (MS-OVBA). A workbook from a user is untrusted input (ADR-013): it must pass the zip
guards of RF-129, refuse XML with a document type (no XXE, no billion laughs), stay within count limits while
streaming, and never evaluate a formula or run a macro. Rosetta needs every cell value, formula, name, table, rule and
macro, read once at upload. A new runtime dependency needs an ADR (`docs/environments-and-delivery.md` section 7) and
a version at least two weeks old (DEC-125).

## Options Considered

1. **`yauzl` (already used, ADR-022) for the package, `saxes` 6.0.0 for the XML, `cfb` 1.2.2 for `vbaProject.bin`,
   and Rosetta's own MS-OVBA decompression, `dir` stream parse and formula tokenizer.** `saxes` (ISC, one dependency
   `xmlchars`, published 2021-11-07) is a streaming, non-validating parser that reports a document type as an event
   and resolves no external entity. `cfb` (Apache-2.0, dependencies `adler-32` and `crc-32`, published 2022-04-06)
   reads compound files.
2. **ExcelJS 4.4.0** (MIT, 2023-10-19): nine runtime dependencies, among them `archiver`, `unzipper` and `jszip`; reads
   the whole workbook into memory; most of it is for writing, which Rosetta never does; no macro source.
3. **SheetJS `xlsx`**: the npm registry holds only 0.18.5 (2022-03-24); later versions are published on the vendor's
   own site, outside the registry and Dependabot (DEC-125).
4. **HyperFormula**: evaluates formulas, which Rosetta must not do, and is GPL-3.0, which does not fit the MIT licence
   of Rosetta and its image.
5. **`fast-xml-parser`**: parses a whole document into an object; a 200 MB sheet part would be held in memory.
6. **Do nothing**: ask users to export sheets as CSV. It loses every formula, name, rule and macro (RFC-005 option C).

## Decision

Use option 1. Pin `saxes` 6.0.0 and `cfb` 1.2.2 exactly, imported only from `src/infrastructure/sources/workbook/`.
Stream each part from `yauzl` into `saxes`; refuse a part on its `doctype` event, on an entity declaration and on
nesting deeper than 64; count bytes, cells and shared strings while streaming. Open a file that starts with the
compound-file signature with `cfb` only to name it (encrypted or legacy) and refuse it. Open `vbaProject.bin` with
`cfb`; decompress the `VBA/dir` stream and each module with Rosetta's MS-OVBA code (section 2.4.1). Extract formula
references with Rosetta's tokenizer; evaluate nothing.

## Rationale

The package reader is already trusted (ADR-022), so only the XML and compound-file readers are new. Both are small,
old enough, permissive, and have few dependencies; `saxes` is also the parser ExcelJS uses. Streaming keeps memory
flat at the limits. The pieces kept in Rosetta are small, specified (MS-OVBA, the A1 reference grammar) and tested from
the specification's examples, which is less risk than a large library whose writing and calculation features are
unused.

## Consequences

- Two runtime dependencies (and `xmlchars`, `adler-32`, `crc-32`) in the baseline list, watched by Dependabot under
  DEC-125.
- Rosetta owns the MS-OVBA decompression, the `dir` stream parse and the tokenizer, each with unit tests.
- Formulas are never recalculated: a value in the rendered snapshot is the one Excel cached, and a workbook saved
  without cached values shows formulas without results.
- Power Query code, charts and pivot tables are listed, not read in depth (Q-34, Q-35).

## References

- RFC-005, DEC-150, RF-129, RF-151, RF-154, ADR-013, ADR-022.

## Notes
