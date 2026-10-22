# Evaluation fixtures

`golden-csharp.json` is a golden set (data-model.md section 3.19) for the synthetic `webforms-csharp` fixture of
`tests/fixtures/repos/`, so the evaluation runner of P2-11 can be tested with the fake provider and the recordings of
`tests/recordings/fake/` (RNF-006, RNF-015, ADR-008). Its findings and "not in the code" cases describe that fixture
only, at the made-up commit `cccc...` of the made-up repository `octo/demo`.

`golden-shop.json` is the golden set of the `webforms-shop` fixture: the steps of its three journeys, the fields and
actions of its four screens, its entities with one relation, one business rule and one "not in the code" case. The
evaluation runner test replays `tests/recordings/fake/understand-shop-model.json` and
`verifier-shop-model.json` over it (P2-23). Its version is `2026-10-17.shop`, at the made-up commit `cccc...`.

`p3-106-asset-manager-deepen.json` and `p3-106-invoice-deepen.json` are the card sets of two Deepen runs of the
2026-10-22 evaluation (P3-106, EV-05, EV-06), trimmed to card type, title, area, claim texts, citations and statuses.
Their sources are public test workbooks (Asset Manager and Invoice Generator, run with a local Ollama model). They
hold the duplicate cards and repeated claims the evaluation found, so `title-merge.test.ts` can count them before and after.

## Provenance (RNF-009)

Written by hand for this repository by the Rosetta contributors and covered by the repository's MIT licence. It
describes no real application and copies no text from anywhere.

Nothing here comes from the owner's employer (DEC-03).
