# Rosetta - Handoff

_Last updated 2026-10-11. Phase **P1 - milestone slice** in progress: G-01 open (DEC-113); 17 cards Done (see `docs/orchestration/tasks.md`); build throttled to one agent at a time (DEC-115)._

## Current state

- `README.md`, `CLAUDE.md` (rules), this file.
- `docs/rfc/RFC-001-rosetta.md` - design proposal, **Status: Accepted** (DEC-113).
- `docs/spec/requirements.md` - release 1 requirements RF-002..RF-1306 and RNF-001..RNF-017, **Status: Accepted** (DEC-113);
  open questions in its section 4.
- `docs/adr/` - ADR-001..ADR-019; counts by status in the [index](docs/adr/README.md).
- `docs/decision-log.md` - decisions DEC-01..DEC-113.
- `docs/journal/` - curated session summaries (the conversation journal is private, outside the repository; DEC-38).
- `docs/conventions.md` and `docs/environments-and-delivery.md` - written 2026-10-10 (toolchain, lint, CI, baseline).
- `.claude/agents/` - builders for difficulty bands (haiku, sonnet, opus, fable), `verifier`, `verifier-fable`,
  `orchestrator` (rewritten 2026-10-11 for DEC-96 and DEC-100).
- Model bands changed by DEC-115: builders haiku 1-5, sonnet 6-8, opus 9-10; verifiers sonnet 1-8, opus 9-10; fable only by owner approval at the third FAIL; usage throttle: one agent at a time (README section 8.1).
- `docs/architecture.md` - written 2026-10-10: layers, layout, state lists, ports, agent loop.
- `docs/design-system.md` v1, `docs/design-system-brief.md` and `docs/design/tokens.css` - written 2026-10-11; design
  board (private Artifact): https://claude.ai/artifact/465wJUMV3RCHvDVAJG2oEm - approved at G-02 (DEC-56); hosted screens (artboards 7-13) approved as a G-02 amendment (DEC-70); v1 artboards revised after a critique (DEC-71); board files in
  `docs/design/board/`.
- `docs/data-model.md` - written 2026-10-10 (all file formats); Q-15 and Q-16 answered (DEC-54, DEC-55).
- `docs/security/threat-model.md` and `SECURITY.md` - rewritten 2026-10-11 for the hosted application (DEC-69).
- `docs/roadmap.md` - written 2026-10-11: P0..P3 for release 1, P4 is release 2, dates for P1 (DEC-87..DEC-92).
- `docs/process-flows.md` - written 2026-10-11, eight flows (DEC-93..DEC-95); PDF `docs/rosetta-flows.pdf` and private
  page https://claude.ai/artifact/1LY8Fx8ZFjxSQXvtRFDoDj, both regenerated 2026-10-11.
- `docs/orchestration/` - build plan written 2026-10-11: protocol (merge rules, usage throttle, gates) and the task
  cards of P1..P3 with the counts in the [tasks.md totals](docs/orchestration/tasks.md) (DEC-96..DEC-101), revised
  after the light review (DEC-102..DEC-112: P1-55 and P1-56 added, gate G-07).

## Resume point

State (2026-10-11): main has P0 work through PR #4, which turned Rosetta into a hosted web
application (DEC-59..DEC-69): no CLI, no plugin; one container image, Docker Compose locally, a host chosen later
(Q-18); accounts, landing page, per-user keys, caps, PostgreSQL plus files; ADR-014..ADR-017; requirements
RF-010, RF-803, RF-1100..RF-1306; threat model rewritten. PR #5 added the approved hosted screens (DEC-70) and the
revised v1 screens (DEC-71). Branch `docs/planning-brief` adds the planning brief and the principle catalogue for
`plan` (DEC-72..DEC-85, ADR-018, RF-604..RF-613; Q-06 answered) and the approved Plan setup artboard (DEC-86). PR #7 added the
roadmap and the process flows (DEC-87..DEC-95). Branch `docs/build-plan` adds the build plan (protocol, cards for
P1..P3, orchestrator agent), ADR-019 (Proposed: `tar` and `ignore`), and DEC-96..DEC-101: the orchestrator merges
task-card pull requests itself under the merge rules; RF-240 and the first RF-425 scenario move into P1; gate names
aligned; up to 3 agents under a 5-hour usage throttle. PR #8 merged the build plan; milestones P1..P3 and issues
#9..#88 exist (one per card). Branch `docs/review-fixes` applies the owner's answers to the light review
(DEC-102..DEC-112): card sizes are agent time and the dates stand; the model verifier stays in P2; the hosted deploy is
split into P1-48 (host ADR) and P1-55 (deploy, behind new gate G-07); the zip export is split into P1-56; cap
semantics, estimate warning, ignore union, audit retention, owner checks and a technical bundle; status lines now
reach `main` through `docs/build-status` pull requests after merges; ADR-006, 007, 009, 014 and 015 amended.

Next, in this order (ask the owner before each):
1. ~~Design system v1 and the design brief~~ DONE 2026-10-11; approved at G-02 (DEC-56).
2. ~~Artboards for the hosted screens (design-system.md section 14)~~ DONE 2026-10-11: artboards 7-13, approved as a
   G-02 amendment (DEC-70).
2a. ~~Plan setup artboard~~ DONE 2026-10-11: artboard 14, approved as a G-02 amendment (DEC-86).
3. ~~Roadmap and process flows~~ DONE 2026-10-11: DEC-87..DEC-95; PDF and page published.
4. ~~Build plan~~ DONE 2026-10-11: DEC-96..DEC-101, ADR-019; pull request for the owner to merge.
5. ~~Create milestones P1..P3 and one issue per card~~ DONE 2026-10-11: issues #9..#88 (DEC-101).
5a. ~~Owner merges `docs/review-fixes`; issues for P1-55 (#90) and P1-56 (#91); issue bodies synced~~ DONE
   2026-10-11 (bodies of the cards that changed (P1-03, 05..09, 11, 13, 14, 16..18, 21, 22, 24..27, 29,
   30, 34..36, 40, 42..50, 54, P2-01, P2-02, P2-12, P2-14, P3-08, P3-12).
6. Owner: add the CI jobs as required status checks to the `main` ruleset once P1-02 is merged
   (environments-and-delivery.md section 5).
7. ~~G-01~~ OPENED 2026-10-11 by the owner instead of the 2026-10-13 review (DEC-113); ADR-019 Accepted.
8. Build: the orchestrator runs P1 from P1-01 under the protocol (`docs/orchestration/README.md`).

Blockers: none. G-04 (Ollama with the DEC-53 models folder and an OpenAI key) holds only the live checks of P1-25,
P1-26 and P1-47; the reader model of Q-04 comes from the P1-47 spike.

## Agenda for the next session (ask the owner first)

1. ~~Round 3 of questions~~ DONE 2026-10-09: DEC-24..DEC-37.
2. ~~File formats walk-through~~ DONE 2026-10-10: DEC-43; data-model.md written, awaiting owner review.
3. ~~Conventions and delivery~~ DONE 2026-10-10: DEC-40, ADR-011.
4. ~~Design system v1 + brief with live web UI mock-ups~~ DONE 2026-10-11: approved at G-02 (DEC-56).
5. ~~Hosted screens artboards, roadmap, process flows, build plan~~ DONE 2026-10-11.
6. Owner review of the whole documentation set, which opens G-01 (DEC-33).

## Gates

Criteria for each gate are defined once in [docs/orchestration/README.md](docs/orchestration/README.md) (section
Human gates). This table records only their state. Open a gate by setting State to `Open` with the date and who
opened it; a `Provisional` gate names the only cards it releases.

| Gate | Name | State | Since | Note |
|---|---|---|---|---|
| G-01 | Documentation set accepted | Open | 2026-10-11 | opened by BlackLigth (blacklight0101) after the light review and its fixes (DEC-113) |
| G-02 | Design board approved (web UI and report) | Open | 2026-10-11 | opened by BlackLigth (blacklight0101): v1 board approved without changes (DEC-56); amended 2026-10-11: hosted screens, artboards 7-13 (DEC-70); v1 artboards 1-6 revised (DEC-71); Plan setup, artboard 14 (DEC-86) |
| G-03 | Public GitHub repository ready | Open | 2026-10-11 | opened by BlackLigth (blacklight0101) in the build-plan session (DEC-101): `blacklight0101/Rosetta` exists, `main` pushed and protected |
| G-04 | Provider access ready | Closed | - | Ollama installed with the DEC-53 models folder; OpenAI key in the owner's `.env`; holds only live-check parts (DEC-104) |
| G-05 | Milestone hand-in approved | Closed | - | the owner submits the M1 URLs by 2026-10-26: hosted URL, teacher account (RF-803) |
| G-06 | Hosted deployment ready | Closed | - | `sha-<short>` image deployed, smoke test passed, teacher account signs in; by 2026-10-24 |
| G-07 | Host account and secrets ready | Closed | - | the owner creates the host account and stores the secrets after the host ADR of P1-48 merges (DEC-104) |


## Decisions pending

- Open questions Q-01..Q-22 are answered or run on their defaults; see [requirements section 4](docs/spec/requirements.md#4-open-questions).
- Deferred ADRs and their triggers are listed in the [ADR index](docs/adr/README.md).

## Session log

- **2026-10-11 (build, second session)** - merged P1-04, P1-58, P1-60, P1-24, P1-16, P1-25, P1-07, P1-17, P1-26 and P1-63 (#102, #112, #111, #113, #114, #117, #115, #116, #121, #122) and the owner decisions DEC-114 (adaptive Ollama context size, #118) and DEC-115 (model bands haiku 1-5 / sonnet 6-8 / opus 9-10, retry ladder with Fable only on owner approval, usage throttle of one agent at a time, #120). The 5-hour usage limit was hit once with four agents running; since then the orchestrator runs one agent at a time and checks usage before each launch. Follow-up cards P1-64..P1-73 filed from verifier MINORs. Owner checks pending: OpenAI key in `.env` (G-04) for the P1-26 live call; Railway (G-07). Defaults to confirm: a `/tree/<ref>/<subpath>` URL takes the first segment as the ref; `www.github.com` URLs are refused; repository files with names invalid on Windows are left out and recorded; workspace name and path caps of 100 and 200 characters; P1-07 body limit 1 MiB.

- **2026-10-11 (build, first cards)** - the orchestrator started P1 after G-01 opened (DEC-113). Done: P1-01 toolchain
  (#93 merged by the owner before verification, completed by #95 after two FAILs and a promotion to opus), P1-48 host
  ADR-020 Railway EU West (#94, started early on the owner's instruction), P1-02 CI (#97; the `gh` token gained the
  `workflow` scope), P1-03 domain kernel (#96), P1-05 configuration (#100), P1-51 documentation tests (#101), P1-06
  PostgreSQL and schema (#103). The owner added the seven required checks to the `main` ruleset. P1-04 secret masker in
  review (#102, promoted to fable after two FAILs). Follow-up cards P1-57..P1-62 filed from MINOR findings. Ollama set
  up on the owner's machine (flash attention, q8_0 KV cache; the adapter must send `num_ctx`, 16k-32k fits the 8 GB
  GPU). Agents install with `npm ci --ignore-scripts`. PR titles must be Conventional Commits of at most 72
  characters with a lower-case subject. Owner checks pending: `docker compose up -d db` with `ROSETTA_DB_ADMIN_PASSWORD`;
  OpenAI key in `.env` (G-04); Railway account (G-07, ADR-020 appendix). Open question to raise: the value shape of the
  `providers` server setting (P1-06 left it unseeded).

- **2026-10-11 (review fixes)** - light review of the build plan (three slice reviewers, high findings verified);
  the owner took every default: DEC-102..DEC-112. Applied on branch `docs/review-fixes`: requirements (CLI wording
  removed, Q-02, Q-03, Q-08, Q-11 closed, caps semantics, estimate warning, ignore union, sign-in CSRF, SSRF on
  connect), data model (`cost_reservations`, HKDF fingerprint, `first_failed_at`, roles outside migrations), ADRs
  006, 007, 009, 014, 015 amended and 012 noted, architecture (`Scheduler`, `StopRun`, `ReadRunFile`), conventions,
  environments, threat model, decision log annotations, tasks (dependency fixes, P1-48 split into P1-48 and P1-55,
  P1-40 split into P1-40 and P1-56, gate fixes, totals 82 cards), protocol (status after merge, P1-01 merge
  exception, owner checks, G-07), agents, roadmap, RFC, flows 3-5 (PDF and page regenerated). Journal:
  `docs/journal/2026-10-11-review-fixes.md`. Next: owner merges, new issues, G-01 review on 2026-10-13.

- **2026-10-11 (build plan)** - protocol and task cards for P1..P3 written from the templates; DEC-96: the
  orchestrator opens and merges task-card pull requests itself under strict merge rules (decision documents stay with
  the owner); DEC-97 and DEC-98 move the basic estimate and the answers file into P1; DEC-99 aligns gate names;
  DEC-100: up to 3 agents with a 5-hour usage throttle (3 to 2 from 75%, 1 from 90%, hold at 95%), orchestrator on Opus 5.5; DEC-101: the remaining defaults
  (all of R1 carded, issues after the merge, host chosen by the owner, spike on the owner's machine, slides drafted by
  Claude); G-03 opened by the owner. ADR-019 Proposed for `tar` and `ignore`. Traceability matrix filled. Next: owner
  merges the plan, issues created, G-01 review on 2026-10-13.

- **2026-10-11 (roadmap and flows)** - roadmap written: P1 milestone slice by 2026-10-22 (hosted deploy 2026-10-20,
  G-06 2026-10-24, hand-in 2026-10-26), P2 full understand, P3 report and plan, P4 release 2; G-01 review set for
  2026-10-13; owner hands-on reviews at the end of P1 and P2; postponement order restated. Eight process flows for the
  teachers, PDF and private page. DEC-87..DEC-95. Next: build plan, then the G-01 review.
- **2026-10-11 (planning brief)** - `plan` gets an interview with defaults (Plan setup) and a principle catalogue
  built from the master's curriculum: DEC-72..DEC-85, ADR-018, RF-604..RF-613, RF-600 withdrawn, Q-06 answered,
  `planning-brief.json` in the data model. Journal: `docs/journal/2026-10-11-planning-brief.md`. Plan setup artboard
  14 approved (DEC-86). Next: roadmap and process flows.
- **2026-10-11 (v1 critique, G-02 amendment)** - Impeccable critique of artboards 1-6 scored 25/40 (three P1: badge
  glyphs, Start run guard rail, cap overrun in the sample). All P1 and P2 fixed: glyphs everywhere, Start run disabled
  until consent with an editable cap, the cap-reached run within its cap with Raise cap and resume, hosted header and
  navigation on the run pages, consistent figures, no overflow at 390 px. Approved (DEC-71). Q-22 (administrator caps)
  left for later; the board is visual only.
- **2026-10-11 (hosted screens, G-02 amendment)** - artboards 7-13 drawn with the Impeccable skill and Claude design:
  landing page ("Watch it work", chosen from three dealt structures), sign in, change password, projects with the
  queue state, settings and keys, administration users and caps, audit. `PRODUCT.md` added; design-system.md
  section 14 gains six components. Two finish-review rounds, detector clean. The owner approved them without
  changes (DEC-70). Next: roadmap and process flows.
- **2026-10-11 (hosted web application)** - the owner wants the teachers to use Rosetta through a URL: DEC-59..DEC-69
  (no CLI, plugin out of scope, one container image local and hosted, accounts and teacher account, landing page,
  server and per-user keys with caps, PostgreSQL plus files, isolation, hand-in URL, security controls).
  ADR-014..ADR-017; RF-010, RF-803, RF-1100..RF-1109, RF-1200..RF-1201, RF-1300..RF-1306, RNF-016, RNF-017;
  RF-001, RF-004, RF-242, RF-1000 withdrawn; Q-17..Q-21 on defaults. RFC, architecture, data model (tables), threat
  model, environments, conventions rewritten. Gate G-06 added.

- **2026-10-11 (modules 07 and 08)** - the master's Modules 07 and 08 reviewed against Rosetta: DEC-57 adopts 20
  items (ADR-013 untrusted input, threat model, SECURITY.md, RF-127, RF-145..RF-147, RF-305, RF-507, RF-1013,
  RNF-014, RNF-015, changes to RF-009, RF-141, RF-301, RF-1011, RNF-004, CI, verifier rules); DEC-58 records what is
  not adopted and why. Private vulnerability reporting turned on.
- **2026-10-11 (G-02 and PR #2)** - the owner approved the design board (DEC-56, G-02 open). PR #1 had been merged on
  2026-10-09 with only the first two commits; the later work was replayed onto `main` in branch
  `docs/p0-design-and-architecture` and opened as PR #2 for the owner to merge.
- **2026-10-11 (design system)** - design-system.md v1, the brief and the token file written; design board v1 published
  as a private Artifact (tokens sheet, start a run, live run, API calls and logs, history with delete, report and
  replay), light and dark, all token pairs WCAG AA (lowest 3.14:1 for control borders). Next: owner reviews the board
  (G-02); then roadmap, flows, build plan.
- **2026-10-10 (end of day)** - Q-15 answered: USD (DEC-54). Q-16 answered: delete button for snapshots and runs in
  the web UI, cost ledger untouched (DEC-55, RF-1012). Resume point rewritten. Next: design system.
- **2026-10-10 (data model)** - data-model.md written: folder map, every file format, event list, call log, cost
  ledger, schema versions. Q-10 answered (DEC-53, models on G:). Q-15 (currency) and Q-16 (clean-up command) open with
  defaults. Next: design system v1 and brief with live-page mock-ups.
- **2026-10-10 (Q-13, Q-14)** - DEC-51: the whole web UI is aimed at M1, with a postponement order if the date is at
  risk; DEC-52: Preact + Vite, Playwright + axe. Next: data-model.md.
- **2026-10-10 (formats and web UI)** - DEC-43..DEC-50: file formats, report look, always English, a live local web UI
  showing spawned agents (ADR-012, RF-1000..RF-1009, RF-506), runs from CLI and browser, input only from public
  GitHub snapshots pinned to a commit (RF-120..RF-126); project tokens and cost always visible (RF-428, RF-1010); provider call observability and application log (RF-408, RF-009, RF-1011). ADR-002 amended. Q-13 (web UI in M1) and Q-14 (front-end
  library) open with defaults. Pushed to PR #1.
- **2026-10-10 (toolchain)** - DEC-40 and ADR-011: researched current practice for the stack; TypeScript 6.0 (7.x waits
  for typescript-eslint), ESLint 10 strict type-checked, Prettier, dependency-cruiser, knip, Vitest 5 coverage, commitlint,
  lefthook, hardened CI. Conventions and environments written; builder and verifier agents written. Q-12 answered by DEC-41
  (Opus 5.5 verifier for 1-9, Fable for 10); DEC-42 secret scanning, push protection and Dependabot enabled. Pushed to PR #1.
- **2026-10-09 (method)** - DEC-39 and ADR-010: spec-driven (spec-anchored) and test-driven development on every card,
  checked by the verifier. Public repository set up, PR #1 open. Ollama 0.40.2 installed in `E:\Ollama\app`, models kept in
  `G:\Ollama Models` (qwen3.5:9b, gemma4:e4b, llama3.1:8b added).
- **2026-10-09 (round 3)** - DEC-24..DEC-37: zip download, Clean Architecture (ADR-009), PostgreSQL if a database is
  ever needed, difficulty 1-10 builder selection, full owner control with a conversation journal, GitHub issue/PR flow.
  DEC-38 keeps the conversation journal private; `docs/journal/` holds curated summaries only. Not committed.
- **2026-10-09** - Project chosen and documentation set scaffolded from the kick-off interview with BlackLigth
  (blacklight0101): DEC-01..DEC-23, Q-01..Q-11, RFC-001, requirements, ADR-002..ADR-008. Demo target chosen
  (eShopLegacyWebForms, MIT). Owner hardware checked (RTX 4060 Ti 8 GB, 32 GB RAM, Ollama not installed). Not
  committed.
