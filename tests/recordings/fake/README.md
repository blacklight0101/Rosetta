# Fake provider recordings

Scripts for the fake provider (`src/infrastructure/providers/fake/`), which replays them instead of calling a model
(ADR-008). Each file lists calls in order, with the attempts of each call and the answer or failure of each attempt:
the reader tasks of the `webforms-csharp` fixture, an injection attempt, a bad tool call, a turn limit, a cost cap,
a stop, the full understand run that the end-to-end tests drive, and the verifier's judgement of its claims
(`verifier-*.json`: the verdicts, a retry, a verdict written before its reason, an answer invalid twice and a Supported answer to every claim).
`understand-flows-screens.json` is a run over the `webforms-shop` fixture whose readers answer FLOW, SCRN and OQ cards
for the catalogue and order journeys and none for the service library (P2-19).

## Provenance (RNF-009)

Every file was written by hand for this repository by the Rosetta contributors and is covered by the repository's MIT
licence. No real provider was called. The text of the answers describes the synthetic repositories of
`tests/fixtures/repos/`, which were also written for this repository. Each file says so in its `description` field.

Nothing here comes from the owner's employer (DEC-03).
