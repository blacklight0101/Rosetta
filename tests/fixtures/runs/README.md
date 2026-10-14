# Recorded run folders

Two run folders in the shape an understand run leaves (manifest, event log, cards, specification, cost report).

| Folder | Used by | Proves |
|---|---|---|
| `replay-demo/` | the report and replay builders, `run-files.test.ts`, and the end-to-end specs `live-run`, `run-report` and `run-replay` (`tests/e2e/support/seed-replay.ts`) | RF-506 the replay timeline; RF-507 a **hostile card** (a `<script>` element, an `<img onerror>`, a `javascript:` link and an `<svg onload>` with a nested script, in a title, a tool argument and a verdict's reason) is shown as text and never runs |
| `sample-report/` | `scripts/build-sample-site.mjs`, which builds the committed `site/` folder | RF-800 the published sample report; it holds no active text, so `site/` can be scanned for secrets and scripts |

## Provenance (RNF-009)

Every file was written by hand for this repository by the Rosetta contributors and is covered by the repository's MIT
licence. The runs are synthetic: the repository `octo/demo`, its commit, the run ids, the timestamps and the model
`model-a` are made-up values, and the cards describe code that exists only in the fixtures of `tests/fixtures/repos/`.
No real run, provider, user or repository is behind them. The hostile strings are payloads that would set
`window.__pwned` or open a dialog if they ever ran; they are inert text here.

Nothing here comes from the owner's employer (DEC-03).
