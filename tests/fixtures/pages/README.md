# Page fixtures

`index-without-run.html` is a stale published index: a Pages page that does not show the run id the smoke step
(`scripts/pages-smoke.mjs`) looks for. `tests/integration/docs/pages-site.test.ts` serves it from a loopback server to
prove the smoke check fails on it.

## Provenance (RNF-009)

The file was written by hand for this repository by the Rosetta contributors and is covered by the repository's MIT
licence. Its run id (`20250101-000000-scan`) is a made-up value; the page is not a copy of any published site.

Nothing here comes from the owner's employer (DEC-03).
