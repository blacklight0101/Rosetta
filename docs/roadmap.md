# Roadmap and backlog

Living document. Phases P0..P3 deliver release 1; P4 is release 2. Later releases are ordered intent, not
commitments; each starts by promoting its reserved requirement range into the requirements with acceptance criteria.
This document is the canonical place for phase scope and exit criteria; the RFC summarises it and the task cards
implement it. Dates come from DEC-87..DEC-92; phases after P1 are sized, not dated, until Q-01 is answered.

## Release 1 phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 Documentation** | repository, documentation set, decisions, open questions, design board | RFC and requirements reviewed and set to Accepted (gate G-01, review on 2026-10-13); every ADR written for the decisions P1 depends on ([index](adr/README.md)); every open question needed by P1 answered or running on its default; decision log applied (no row with an empty Where applied); design board approved (G-02, open) |
| **P1 Milestone slice (M1)**, 2026-10-13 to 2026-10-22 | the hosted web application: container image, Compose and hosted deploy (RF-1300..RF-1305), accounts, sessions, keys, caps and audit (RF-1100..RF-1109), landing page (RF-1200, RF-1201), projects from GitHub URLs and snapshots (RF-010, RF-120..RF-127), universal scan and the C# pack (RF-100..RF-112), egress guard (RF-140..RF-147), `understand` with read-only agents, the citation check and the answers file (RF-200..RF-205, RF-240, RF-300, RF-302), Ollama and OpenAI behind one port (RF-400..RF-408), budget guard and the basic estimate (RF-420..RF-428; RF-425 first scenario, DEC-97), the live web UI (RF-1001..RF-1013), Markdown report and replay (RF-504, RF-506, RF-507), hand-in artefacts (RF-800..RF-803) | every Must requirement of the phase verified by its stated criterion; `npm run verify` green on Windows and Linux in CI; the demo repository is scanned and one area understood end to end on the hosted URL with the teacher account; hosted deploy by 2026-10-20; G-06 open by 2026-10-24; owner hands-on review held around 2026-10-22 and its changes recorded as DEC rows and cards; hand-in submitted (G-05) by 2026-10-26 |
| **P2 Full understand** | every area, the second verifier step and its calibration (RF-301, RF-303..RF-305), coverage, open-question loop and consolidation (RF-230..RF-250), resume (RF-006), `estimate` and caps per role (RF-423, RF-425, RF-427), Anthropic and OpenAI-compatible adapters (RF-403, RF-404), excerpt limits (RF-144), backups (RF-1306), golden-set evaluation (RNF-006, RNF-012, RNF-015) | every Must requirement of the phase verified; the golden set meets the success criteria of RFC-001 section 7 (claim precision, rule recall, citation validity, estimate accuracy); owner hands-on review at the end of the phase with its changes recorded |
| **P3 Report and plan** | the HTML report (RF-500..RF-503, RF-505, RNF-010) and `plan`: the Plan setup page, the principle catalogue and the hand-off package (RF-601..RF-613, ADR-018) | every Must requirement of the phase verified; a hand-off package produced for the demo repository from a saved planning brief, with every requirement traced to a source card; the report passes its WCAG 2.1 AA checks |

If P1 runs late, features leave the milestone in this order and move to P2: RF-1012, RF-1011, RF-1005, RF-1007,
RF-1008, RF-1004 (DEC-51), then the run queue RF-1108 (DEC-68). Nothing else moves without a new decision (DEC-90).

## Prerequisites

- The documentation set accepted - needed by P1 - tracked by G-01 (owner review on 2026-10-13).
- Provider access: Ollama with the reader model and an OpenAI key - needed by P1 - tracked by G-04 and Q-04.
- A host for the hosted deployment, its secrets and the teacher account - needed by P1 (by 2026-10-20) - tracked by
  Q-18 and G-06.
- The master's final delivery date - needed to date P2 and P3 - tracked by Q-01.

## Later releases

| Release | Scope | Entry condition |
|---|---|---|
| R2 (P4) | a second demo target in another stack and a report comparing quality and cost per provider and model (RF-900..RF-999); the final master delivery | release 1 complete; Q-01 and Q-05 answered |
| Out of scope until reviewed | the Claude Code plugin run mode (RF-700..RF-799) | the owner brings it back after 2026-10-26 (DEC-60) |

## Future backlog (not requirements)

- A quality score of the legacy code against the principle catalogue (SOLID, KISS and others), as its own feature
  (DEC-83).
- An OpenTelemetry exporter for traces (deferred ADR in [the ADR index](adr/README.md); DEC-57).
- Which caps apply to the administrator's own runs (Q-22, on its default).

## Backlog by requirement id (R1)

| Phase | Requirements |
|---|---|
| P1 | RF-002, RF-003, RF-005, RF-007..RF-010, RF-100..RF-106, RF-110..RF-112, RF-120..RF-127, RF-140..RF-143, RF-145..RF-147, RF-200..RF-205, RF-240, RF-300, RF-302, RF-400..RF-402, RF-405..RF-408, RF-420..RF-422, RF-424, RF-425 (first scenario), RF-426, RF-428, RF-504, RF-506, RF-507, RF-800..RF-803, RF-1001..RF-1013, RF-1100..RF-1109, RF-1200, RF-1201, RF-1300..RF-1305; RNF-001..RNF-005, RNF-007..RNF-009, RNF-011, RNF-013, RNF-014, RNF-016, RNF-017 |
| P2 | RF-006, RF-144, RF-230, RF-241, RF-250, RF-301, RF-303..RF-305, RF-403, RF-404, RF-423, RF-425 (second scenario), RF-427, RF-1306; RNF-006, RNF-012, RNF-015 |
| P3 | RF-500..RF-503, RF-505, RF-601..RF-613; RNF-010 |

Withdrawn ids (RF-001, RF-004, RF-242, RF-600, RF-1000) are not built. RF-240 and the first scenario of RF-425 moved into P1 with the build plan (DEC-97, DEC-98); the cards per requirement are in the [traceability matrix](spec/requirements.md#8-traceability-matrix) and [tasks.md](orchestration/tasks.md). The non-functional requirements of P1 apply
in every later phase too; they are listed once, in the phase that first has to meet them.

## Deliberately not built in release 1

- Rebuilding or migrating the legacy system: Rosetta stops at the hand-off package (DEC-10).
- A command-line interface: every stage is an action in the web application (DEC-59).
- The Claude Code plugin run mode, until reviewed after 2026-10-26 (DEC-60).
- Public sign-up, e-mail password reset or multi-factor sign-in: the administrator creates every account (DEC-62).
- Local folders or private repositories as input: only public GitHub repositories (DEC-48).
- Modifying, refactoring or running the legacy code: tools are read-only (DEC-17).
- Analysing the owner's employer's code in this public project (DEC-03).
- Training or fine-tuning models.
- A quality score of the legacy code against the principle catalogue (DEC-83; future backlog above).
- A second demo target and the provider comparison: release 2 (RF-900..RF-999).

Reasons are in RFC-001 section 2 (non-goals) and the ADRs.
