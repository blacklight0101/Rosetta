# Call-log fixtures

Three `provider-calls.jsonl` files that `jsonl-provider-call-log-fixtures.test.ts` copies into a run folder before the
call log appends a record, to prove the `seq` numbering continues after them: `crlf/` (records with Windows line
endings), `empty/` (an empty file) and `long-array/` (one line of about 100 KB whose `password` array holds 5,000
masked items).

## Provenance (RNF-009)

Every file was generated or written by hand for this repository by the Rosetta contributors and is covered by the
repository's MIT licence. The records carry made-up call ids (`20261011-090503-understand#1`) and made-up latencies;
no real run, provider or user is behind them.

Nothing here comes from the owner's employer (DEC-03).
