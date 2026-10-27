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

`golden-csharp.json` and `golden-shop.json` were written by hand for this repository by the Rosetta contributors, cover
fixtures that are made up, and are under the repository's MIT licence. They describe no real application and copy no
text from anywhere.

`p3-106-asset-manager-deepen.json` and `p3-106-invoice-deepen.json` are not hand-written: they are trimmed card sets
from two evaluation runs over public test workbooks (see above). They hold text a local model wrote about those
workbooks, with citations into them, and nothing else.

`p3-110-invoice-deepen2.json` and `p3-110-eshop-deepen2.json` are trimmed task-result card sets of the 2026-10-23
Deepen runs (pass 2) over two public projects: the Invoice Generator workbook and the eShopModernizing sample on
GitHub. The eShop file keeps only the cards whose type and title repeat in more than one area (claim text cut to 240
characters). They are the cards as the readers wrote them, before consolidation (P3-110, EV-25, EV-26).

Nothing here comes from the owner's employer (DEC-03).

`p2-46-shop-haiku-run.json` (P2-46, RNF-012) is a hand-trimmed, synthetic recording shaped like the Haiku 5.5 evaluation
of 2026-10-25 on the public WebForms demo shop: seven areas with rounded token sizes and generic names, the page files
that mark two of them, the shipped Haiku 5.5 prices, and the cost of each role in the three runs. It holds no source
text, key or personal data and is under the repository's MIT licence.
