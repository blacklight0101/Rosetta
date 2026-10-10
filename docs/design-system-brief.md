# Rosetta: design system brief (input for a design tool)

| | |
|---|---|
| **Status** | Superseded 2026-10-11: the board drawn from it was approved without changes (DEC-56); the result is design-system.md v1 and `docs/design/board/`; kept for history only |
| **Sent to** | Claude (Design canvas Artifact "Rosetta design board v1"), run with the owner on 2026-10-11; the owner may also run it in another design tool |
| **Folded back into** | [design-system.md](design-system.md) (v1); after approval at G-02 the board is exported to `docs/design/board/` and this brief is marked Superseded |

## What this is and what I want back

Rosetta is an open-source tool that reads a legacy codebase from a public GitHub repository and writes a verified,
evidence-cited functional specification, using AI agents. I want a design board for two surfaces that share one
component set: a **live local web UI** that shows the agents working, and a **static published report**. Back I
need: tokens for light and dark, the components in all their states, and the six screens in Appendix A.

## Product context

Developers and tech leads who inherit a legacy system run Rosetta on their own machine. A run spawns several agents
(readers per area of the code, a verifier, a summariser); each reads files through tools, proposes cards with claims
that cite `path:lines`, and a verifier marks each claim supported or rejected. Runs cost money on cloud providers,
so cost must always be visible. The report is published on GitHub Pages as the project's demo.

## Hard constraints (do not change)

- Text wordmark "Rosetta", no logo; system fonts only; deep teal accent; light and dark themes following the
  operating system (DEC-44).
- English only (DEC-45).
- Very verbose and graphic live view of every spawned agent and its progress (DEC-46).
- Project total tokens and cost visible on every page, during and after runs (DEC-49).
- A view of every provider call (Ollama or cloud) and of the application log (DEC-50).
- Delete for runs and snapshots with a confirmation that keeps the cost totals (DEC-55).
- WCAG 2.1 AA; status never by colour alone.
- Built with Preact; inline SVG icons; no web fonts or CDNs (DEC-52).

## Users and devices

One developer at a desktop or laptop browser (1280 px and wider), mouse and keyboard, often next to a terminal. The
report is read by anyone, on any device from 360 px.

## Brand inputs

Name "Rosetta" (after the Rosetta Stone: one text in several scripts - legacy code in, plain specification out).
Tone: precise, calm, technical, trustworthy. No mascot, no gradients, no illustrations.

## Current draft

[design-system.md](design-system.md) v1 and [`docs/design/tokens.css`](design/tokens.css).

## Appendix A: screens to mock up

1. Tokens and components sheet (colours, type, badges, buttons, meter, field with error).
2. Start a run: GitHub URL, resolved commit, stage and areas, estimate, cloud warning with consent.
3. Live run: pipeline stepper, summary counters, one panel per agent, timeline, verbose event stream, stop.
4. API calls and logs: per-provider summary (Ollama tokens per second), filterable call table with retries and
   errors, call details, application log with level filter.
5. History and snapshots: runs and snapshots tables with delete, the delete confirmation dialog open.
6. Published report: dashboard, a card with supported and rejected claims and permalinks, run replay player, open
   questions.

## Appendix B: components

Header totals, button, field, status badge, pipeline stepper, stat card, agent panel, timeline, event stream, data
table, cost meter, callout, dialog, card view, replay player, log list.

## Appendix C: states to design

Every value of `ClaimStatus`, `AgentTaskState`, `RunEndState`, `OpenQuestionState` and provider call status
([architecture](architecture.md) section 5, [data-model](data-model.md) section 3.10); cost meter under 80 %, warn and
danger; disabled-with-reason buttons; connection lost banner; empty states.

## Appendix D: ancestry you may reuse

None.

## Deliverables expected back (checklist)

- [x] Token file for light and dark (v1: `docs/design/tokens.css`)
- [x] Components sheet with every badge state
- [x] The six screens of Appendix A in light, with a dark switch
- [x] Owner review: approved without changes, no v2 needed (DEC-56)
- [x] Board exported to `docs/design/board/`
