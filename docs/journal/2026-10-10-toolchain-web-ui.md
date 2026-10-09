---
type: journal
date: 2026-10-10
decisions: DEC-40..DEC-52
---

# 2026-10-10 - Toolchain, file formats, web UI and GitHub sources

Curated summary of the working session (DEC-38). No conversation is recorded here.

## Topics and outcomes

| Topic | Outcome | Why | Ids |
|---|---|---|---|
| Stack best practices | Strict TypeScript 6.0 toolchain with automated gates built into builders and verifiers | Rules in prose drift; tools enforce them on every card | DEC-40, ADR-011 |
| Build verifier model | Opus 5.5 verifies cards of difficulty 1-9, Fable verifies difficulty 10 | The verifier should be at least as strong as the builder | DEC-41, Q-12 |
| Repository security | Secret scanning with push protection and Dependabot enabled | Public repository; keys must never land in history | DEC-42 |
| File formats | `rosetta-out/` layout, Markdown cards with a YAML header, `schemaVersion` everywhere, masked transcripts | Readable by people and by tools; reproducible runs | DEC-43 |
| Report and terminal look | Multi-page static report, teal accent, light and dark; compact coloured terminal lines | Works without JavaScript and on GitHub Pages | DEC-44 |
| Output language | Always English | One language for readers, builders and reviewers | DEC-45 |
| Live web UI | A verbose, graphic loopback web page shows every spawned agent and its progress; the report replays it | Makes the agents' work visible and convincing for the demo | DEC-46, ADR-012 |
| Starting runs | From the CLI and from the browser | Terminal for developers, browser for demos | DEC-47 |
| Input | Only public GitHub repository URLs, resolved to a commit and downloaded as a snapshot | Reproducible runs and citations anyone can open | DEC-48, ADR-012 |
| Project cost | Tokens and price for the whole project always visible in the web UI, live during runs and afterwards | Cost must never be out of sight | DEC-49 |
| Observability | Every provider call (Ollama or cloud) recorded with timing, tokens, cost and status and shown live; structured application log | Diagnose slow, failing or costly calls and any problem after the fact | DEC-50 |

## Open questions raised and answered

| Question | Answer | Ids |
|---|---|---|
| Q-13 - which web UI parts are in the M1 milestone | All of them are aimed at M1; if the date is at risk, the least essential panels move to P2 in a fixed order, decided by the owner | DEC-51 |
| Q-14 - front-end library | Preact with Vite; Playwright and axe for browser tests | DEC-52 |
