# Fake provider recordings

Scripts for the fake provider (`src/infrastructure/providers/fake/`), which replays them instead of calling a model
(ADR-008). Each file lists calls in order, with the attempts of each call and the answer or failure of each attempt:
the reader tasks of the `webforms-csharp` fixture, an injection attempt, a bad tool call, a turn limit, a cost cap,
a stop, the full understand run that the end-to-end tests drive, and the verifier's judgement of its claims
(`verifier-*.json`: the verdicts, a retry, a verdict written before its reason, an answer invalid twice and a Supported answer to every claim; `verifier-flow-screen.json` judges a FLOW and a SCRN card with a bad step and made-up claims, `verifier-flow-step-rejected.json` rejects one step of the `webforms-shop` run, P2-20).
`understand-flows-screens.json` is a run over the `webforms-shop` fixture whose readers answer FLOW, SCRN and OQ cards
for the catalogue and order journeys and none for the service library (P2-19).
`understand-shop-model.json` is the same run with the Services area answering two `ENT` cards (one relation the code shows, one it does not) and the shipping `BR` card, and `verifier-shop-model.json` judges it (the second and fourth claims rejected, the rest Supported); the evaluation runner test scores them against `tests/fixtures/eval/golden-shop.json` (P2-23).
`plan-options.json` is the `planner` role answering the Plan setup options (RF-608, RF-609, P3-07): two architecture styles with trade-offs and evidence, one recommended, and two options for each of the seven stack layers.
`planner-package.json` holds the planner's two answers for the hand-off package of a seeded order-shop run. The first is the plan: requirements that cite supported cards, one that cites only a card without a supported claim, one holding hostile Markdown and HTML, an entity mapping without a supported card and a task in a phase that does not exist (P3-09). The second is the product requirements document: features that cite `FEAT` cards (one only a card without a supported claim, one holding hostile Markdown and HTML), rules that cite `BR` cards (one citing a `FEAT` card), an out-of-scope item and no roles (P3-15). A third call is the data model (RF-623, P3-17): tables over supported ENT claims, a column whose claim is not supported, a type that is not a type name, a name that is not an identifier, a foreign key to a missing table and a dropped field.
`planner-trd.json` is the same answer with a technical part for `trd.md`: integrations (one for an unknown card, one repeated), four security controls (two denylists, one with no supported card), two non-functional targets (one with no source card) and two environments (one naming a decision that does not exist) (P3-16).

## Provenance (RNF-009)

Every file was written by hand for this repository by the Rosetta contributors and is covered by the repository's MIT
licence. No real provider was called. The text of the answers describes the synthetic repositories of
`tests/fixtures/repos/`, which were also written for this repository. Each file says so in its `description` field.

Nothing here comes from the owner's employer (DEC-03).
