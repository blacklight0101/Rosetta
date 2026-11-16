# Release notes

One section per release, newest first. A release is a pull request that bumps `package.json` and adds its section
here; after it merges, a tag `vX.Y.Z` and a GitHub release with the same notes are made
([environments-and-delivery.md](environments-and-delivery.md) section 8, DEC-29). Every release pull request bumps the
version (DEC-248). Versions follow Semantic Versioning; 1.0.0 is release 1.

The v1.0.0 section describes the whole system by area. The v0.1.0 section below is kept as history: every requirement
id in it is backed by the [milestone verification matrix](verification/m1-matrix.md), the evidence for the P1 exit
criterion, and it claims nothing the matrix marks as a gap. Where the system has moved on since that matrix was
reviewed, the v0.1.0 section says what closed, and the matrix itself is not revised.

## v1.0.0 - Release 1

|                | Release 1                                                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | The current system, called version 1.0.0 by the owner on 2026-11-16 (DEC-248). The tag `v1.0.0` and the GitHub release are made on `main` after this version merges, by the orchestrator on the owner's word; until then they are the plan, not done. |
| **Date**       | 2026-11-16                                                                                                                                                                                                                                            |
| **Version**    | 1.0.0, as reported by `GET /healthz` and recorded in every run manifest (RF-1303). The hosted application reported 0.1.0 up to the deploy of 2026-11-16 and reports 1.0.0 from the next deploy of `main`.                                             |
| **Supersedes** | v0.1.0, which was never tagged (see below)                                                                                                                                                                                                            |
| **Run it**     | the [README quick start](../README.md#quick-start) and the [local runbook](runbooks/local.md): Docker Compose, one image, `http://127.0.0.1:8080`; hosted: see Where to find it                                                                       |

Rosetta turns a legacy codebase into an evidence-cited functional specification and a tool-agnostic modernisation
hand-off package. Release 1 is the whole pipeline as a web application with accounts and cost control: a public
GitHub repository, an uploaded zip or uploaded Excel workbooks go through `scan`, `understand` with a verifier, Deepen,
the owner's answers, the report and `plan`, with a guided journey over all of it under one approved amount. It runs on
your machine with Docker Compose and, for invited users, hosted on Azure Container Apps.

### What v1.0.0 delivers

Grouped by area. Requirement ids and their tests are in the [spec](spec/requirements.md) and the
[release 1 matrix](verification/r1-matrix.md) (reviewed 2026-10-19, before phases 5 to 10); each later card was verified
under the merge rules of the [orchestration protocol](orchestration/README.md).

| Area                      | What you get                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sources                   | A public GitHub repository pinned to a commit, an uploaded zip (DEC-148, [ADR-022](adr/ADR-022-zip-extraction-with-yauzl.md)) or uploaded Excel workbooks, `.xlsx` and `.xlsm`, with sheets, formulas, validations and VBA macros rendered to text (DEC-150, [ADR-023](adr/ADR-023-workbook-reading-with-saxes-and-cfb.md)). Private repositories and local folders are not read.              |
| Scan                      | A deterministic code map of any stack without AI: languages, entry points, embedded SQL and areas, a C# language pack with a coarse fallback, secret masking before anything leaves the machine, an egress record and a warning before a cloud provider is used.                                                                                                                               |
| Understand and verifier   | Agents read every area and write cards that cite file and line ranges, with the open questions collected. A two-step verifier (a citation check in code, then a model judgement) marks every claim supported or rejected, and rejected claims stay visible ([ADR-005](adr/ADR-005-evidence-cards-and-two-step-verifier.md)).                                                                   |
| Deepen                    | Rounds that read what the first run left unread and re-read rejected claims, with honest coverage ([RFC-003](rfc/RFC-003-re-read-loop.md)).                                                                                                                                                                                                                                                    |
| Owner questions           | Open questions answered in the page, consolidated across the run and fed back into Deepen.                                                                                                                                                                                                                                                                                                     |
| Report                    | An HTML report rendered from Preact components to static HTML ([ADR-021](adr/ADR-021-report-rendering-with-preact.md)), a replay of every agent's work, diagrams, a Markdown report and a cost page; model and repository text is always rendered as escaped text.                                                                                                                             |
| Plan and hand-off package | A Plan setup page, a versioned principle catalogue ([ADR-018](adr/ADR-018-planning-brief-and-principle-catalogue.md)) and a package with the target architecture, decision records, roadmap and task cards, written so that an AI agent team can build from it (phase 6). Rebuilding the legacy system is never part of Rosetta.                                                               |
| Guided journey            | One approved amount for a project from scan to plan: the steps are chained under it and offered in place ([ADR-027](adr/ADR-027-guided-journey-per-project.md)), and a run pauses and asks near the amount instead of stopping at a hard cap ([ADR-026](adr/ADR-026-pause-and-ask-near-the-approved-amount.md)).                                                                               |
| Accounts and cost control | Sign-in with administrator-managed accounts, sessions, your own provider keys stored encrypted, private workspaces, a teacher account, a run queue and a security audit trail. Ollama, OpenAI, Anthropic and OpenAI-compatible providers behind one port, an estimate before every run, caps per run, per role, per user and per month, a live cost meter, a cost report and a project ledger. |
| Hosted application        | One container image on Azure Container Apps in Spain Central with Azure Database for PostgreSQL ([ADR-024](adr/ADR-024-host-on-azure-container-apps-spain-central.md)), HTTPS only, deployed from `main` by the Release workflow after the ZAP baseline passed, with a smoke test, backups and a restore drill ([deploy runbook](runbooks/deploy.md), [backup runbook](runbooks/backup.md)).   |
| Prompt lab (phase 10)     | A lab that runs every prompt on recorded cases, judges answers against a rubric and keeps a prompt version only when it beats the current one on held-back cases, within a spend ledger ([ADR-029](adr/ADR-029-prompt-lab-cases-and-spend-ledger.md), DEC-231, [report](evaluation/prompt-lab/README.md), [runbook](runbooks/prompt-lab.md)).                                                  |

### Release pull requests since v0.1.0

Each was merged into `main` by the owner with a merge commit and deployed afterwards (see the
[deployment record](runbooks/deploy.md#deployment-record)).

| Pull request                                                 | Merged     | What it carried                                         |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------------- |
| [#1035](https://github.com/blacklight0101/Rosetta/pull/1035) | 2026-10-29 | phase 6 and upload fixes                                |
| [#1120](https://github.com/blacklight0101/Rosetta/pull/1120) | 2026-11-02 | phases 7 and 8: evaluation fixes and the guided journey |
| [#1351](https://github.com/blacklight0101/Rosetta/pull/1351) | 2026-11-09 | phase 8, waves 2 and 3                                  |
| [#1419](https://github.com/blacklight0101/Rosetta/pull/1419) | 2026-11-15 | phase 9 fixes and the phase 10 prompt lab               |
| [#1423](https://github.com/blacklight0101/Rosetta/pull/1423) | 2026-11-16 | cards P9-18 and P9-19                                   |

### Known limits

What is still true on 2026-11-16. The open cards and their counts are in the [tasks.md totals](orchestration/tasks.md);
most Blocked cards are withdrawn ones that kept their id.

- Production does not start on time by itself. The GitHub schedule starts late (ADR-028, still Proposed, chooses a
  Container Apps job; its cards P8-66 to P8-71 are Todo), so the deploys since 2026-10-30 were started by hand.
- Staging is off: `ROSETTA_STAGING_ENABLED` is not set, so Release skips the staging check with a warning.
- The deploy of 2026-11-16 needed three attempts: a Release started by hand before the ZAP baseline had passed was
  refused, and the smoke test's scan step timed out once at its five-minute limit before it passed on a rerun
  (`ROSETTA_SMOKE_SCAN_TIMEOUT_MS`, [deploy runbook](runbooks/deploy.md)).
- The reports of the three-app evaluations of 2026-11-02 and 2026-11-09 (cards P7-19 and P8-46 to P8-49) are In review
  until the owner has read them. P2-53 waits for the owner to time the report build on the hosted URL.
- A small local model mostly describes structure; hosted models write more precise cards
  ([README](../README.md#tested-providers-and-models)).
- No self sign-up, e-mail password reset or multi-factor sign-in: the administrator creates every account. No command
  line interface and no Claude Code plugin (DEC-59, DEC-60).
- Release 2 (phase P4: a second demo target in another stack and a provider comparison report) has not started, and the
  standard modules checklist is held by gate G-09 ([roadmap](roadmap.md)).
- The published sample report is permanent recorded sample data, not a live run (DEC-250).
- The owner's manual check of RF-1002 (the live agent view in a real run) is not recorded in the repository.

### Where to find it

- Repository: <https://github.com/blacklight0101/Rosetta>
- Hosted application: <https://ca-rosetta.nicewater-1ef3fc33.spaincentral.azurecontainerapps.io> (invited users; first deployed 2026-10-24, last deployed 2026-11-16)
- Sample report: <https://blacklight0101.github.io/Rosetta/> (live since 2026-10-25)

## v0.1.0 - Milestone 1: the scan and understand slice

|                    |                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**         | Prepared by card P1-52 for the milestone, which was submitted on 2026-10-26 (G-05). Never tagged: superseded by v1.0.0 (DEC-248), so no tag `v0.1.0` and no GitHub release exist. |
| **Milestone date** | 2026-10-26 (DEC-29)                                                                                                                                                               |
| **Version**        | 0.1.0, as `GET /healthz` of the hosted application reported it until 2026-11-16 (RF-1303)                                                                                         |
| **Evidence**       | the matrix, reviewed on `main` at `6cb4d0e8` (card P1-49)                                                                                                                         |
| **Run it**         | the [README quick start](../README.md#quick-start) and the [local runbook](runbooks/local.md): Docker Compose, one image, `http://127.0.0.1:8080`                                 |

Rosetta turns a public GitHub repository into an evidence-cited functional specification. This first version, kept here
as history, was the slice of that pipeline that was planned for the milestone: it pins a commit, maps the code without AI (`scan`), lets
read-only agents write cards that cite file and line ranges and rejects the claims the code does not support
(`understand`), shows every agent live with its tokens and cost, and publishes a replay of a run. It is a web
application with accounts, and it runs on your machine with Docker Compose.

### What v0.1.0 delivers

Grouped by requirement area. "Pending" marks an automated check that passes and a manual check that is still with the
owner when the matrix was reviewed (see Pending owner checks). Each id has passing tests in the matrix except where marked.

| Area                             | Requirements                                                                                                                                                                                           | What you get                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects, configuration and runs | RF-002, RF-003, RF-005, RF-007, RF-008, RF-009, RF-010                                                                                                                                                 | Create a project from a public GitHub URL, validate its configuration, record every run, never write to a snapshot, stable `RST-xxxx` error codes, a zip export of a run and an application log.                                                                                                                                                                                                                                                                       |
| Scan and file access             | RF-100, RF-101, RF-102, RF-103, RF-104, RF-105, RF-106, RF-110, RF-111, RF-112, RF-120, RF-121, RF-122, RF-123, RF-124, RF-125, RF-126, RF-127, RF-140, RF-141, RF-142, RF-143, RF-145, RF-146, RF-147 | A deterministic code map of any stack (languages, entry points, embedded SQL, areas), a C# language pack with a coarse fallback for other languages, pinned and cached GitHub snapshots with subpath and rate-limit handling, citation links to GitHub, an ignore file, secret masking before anything leaves the machine, an egress record, a warning before a cloud provider is used, labelled data blocks for analysed code, bounded grep and a built-in deny list. |
| Understand                       | RF-200, RF-201, RF-202, RF-203, RF-204, RF-205, RF-240                                                                                                                                                 | Agent tasks planned per area, a read-only tool loop, valid evidence cards with stable ids, cards and a specification written to the run folder, support for models without native tool calling and the open questions collected for the owner.                                                                                                                                                                                                                         |
| Verifier                         | RF-300, RF-302                                                                                                                                                                                         | A citation check that every cited file and line range exists, and rejected claims that are kept and marked, never deleted.                                                                                                                                                                                                                                                                                                                                             |
| Providers and cost control       | RF-400, RF-401, RF-402, RF-405, RF-406, RF-407, RF-408, RF-420, RF-421, RF-422, RF-424, RF-425, RF-426, RF-428                                                                                         | One provider port with an Ollama adapter and an OpenAI adapter, a model per role, retries that fail cleanly, a Test button for each provider, a provider call log, a price table, every call metered, a hard cap per run, a live cost meter, an estimate before a run (first scenario), a cost report and a project cost ledger.                                                                                                                                       |
| Report                           | RF-504, RF-506, RF-507                                                                                                                                                                                 | A Markdown report for the milestone, a replay of the agents' work and repository and model text rendered as escaped text, never as HTML.                                                                                                                                                                                                                                                                                                                               |
| Hand-in artefacts                | RF-800, RF-802                                                                                                                                                                                         | The sample report as a static site for GitHub Pages and the slides and video script in Spanish; their URLs are filled in under Links.                                                                                                                                                                                                                                                                                                                                  |
| Web UI                           | RF-1001, RF-1002, RF-1003, RF-1004, RF-1005, RF-1006, RF-1007, RF-1008, RF-1009, RF-1010, RF-1011, RF-1012, RF-1013                                                                                    | Start a run from the browser, watch every agent live, live cost and budget, the verification view, the coverage map, stored run events, answers to open questions in the page, run history and downloads, protection of every request, project tokens and cost always visible, provider calls and logs, deletion of snapshots and runs, security headers and cookies.                                                                                                  |
| Accounts, sessions and keys      | RF-1100, RF-1101, RF-1102, RF-1103, RF-1104, RF-1105, RF-1106, RF-1107, RF-1108, RF-1109                                                                                                               | Sign in with a user name and password, sessions and sign-out, administrator-managed accounts, password change, your own provider keys stored encrypted, private workspaces, usage caps, a teacher account, a run queue and a security audit trail.                                                                                                                                                                                                                     |
| Landing page                     | RF-1200, RF-1201                                                                                                                                                                                       | A public landing page and its reach settings.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Container and deployment         | RF-1300, RF-1301, RF-1302, RF-1303, RF-1305                                                                                                                                                            | One container image, a local Docker Compose stack bound to `127.0.0.1`, migrations applied by a one-off `migrate` step before the app starts (DEC-140), a health endpoint and configuration from the environment, with a server that refuses the all-zero placeholder secret key (`RST-1008`).                                                                                                                                                                         |
| Non-functional                   | RNF-001, RNF-002, RNF-003, RNF-004, RNF-005, RNF-007, RNF-008, RNF-009, RNF-010, RNF-013, RNF-014                                                                                                      | Portability, robustness, no secret in code or output, reproducible runs, offline tests, scan speed, usability, licence review of fixtures, accessibility checks, Clean Architecture enforced by a gate and secure defaults on the local stack.                                                                                                                                                                                                                         |

### Not in v0.1.0

- The `plan` stage and its hand-off package, and the full HTML report: later phases (see the [roadmap](roadmap.md)).
- The model-based second verifier step and per-role caps beyond the run cap: phase P2.
- Providers other than Ollama and OpenAI: the milestone requirements do not cover them and the matrix has no
  evidence for them.
- The hosted deployment went live on 2026-10-24 (card P1-55, RF-1304), before the milestone, so it is part of v0.1.0 even
  though the matrix was not revised. The image is published to GHCR as `sha-<short>` from `main`; the SBOM is attached
  only to the GitHub release of a tag, and v0.1.0 has none.

### Known gaps

Requirements the matrix marked as a gap when it was reviewed, the card that closes each, and what happened since:

| Id      | What was missing                                                                                                                                                                                              | Closed by                      | State on 2026-11-16                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| RF-801  | The quick start walked on a clean clone. The walk-through is recorded in the pull request of card P1-52 with the commands and their output; the matrix row stays a gap until the next revision of the matrix. | P1-52                          | Closed: card P1-52 is Done. The matrix was not revised.                                                                                   |
| RF-803  | The teacher's sign-in on the hosted URL the day before the hand-in.                                                                                                                                           | P1-54 (gate G-06)              | Closed: card P1-54 is Done and G-06 opened on 2026-10-24.                                                                                 |
| RF-1304 | The hosted deployment and its smoke test.                                                                                                                                                                     | P1-55 (gate G-07)              | Closed: deployed 2026-10-24 and the smoke test passed (card P1-55 is Done).                                                               |
| RNF-011 | A scan and an understand run with Ollama only and the network off.                                                                                                                                            | P1-47 (owner's model download) | Closed: card P1-47 is Done.                                                                                                               |
| RNF-016 | Hosted availability with a health check and the monthly cap.                                                                                                                                                  | P1-55 (gate G-07)              | Closed with the hosted deployment (card P1-55 is Done).                                                                                   |
| RNF-017 | Page and event timing with two runs on the hosted deployment.                                                                                                                                                 | P1-55 (gate G-07)              | Closed: measured on the hosted URL on 2026-10-24, reported by the owner on 2026-10-26; the script output was not pasted into the runbook. |

Findings the matrix ranked MAJOR, none of them BLOCKING:

- **F-01** (fixed in card P1-157): refused requests wrote audit rows without a bound, so a script could grow the audit
  table on a hosted deployment. It needed the owner's answer on DEC-124 first. The local stack is published on
  `127.0.0.1` only.
- **F-02** (fixed in card P1-158, merged after the matrix review): the serving process no longer receives the migrator
  database credentials; the `migrate` service of `compose.yaml` applies the migrations and the app holds only the
  `rosetta_app` credential (DEC-140). The matrix row keeps its reviewed state until its next revision.
- **F-03** (fixed in card P1-108): the all-zero `ROSETTA_SECRET_KEY` placeholder of `.env.example` is refused at
  start-up with `RST-1008`. This is why the quick start generates a key before the first start.

The MINOR findings F-04 to F-25 were tracked by cards P1-159, P1-160 and P1-161, all Done now (P1-159 was open when the
matrix was reviewed; see [tasks.md](orchestration/tasks.md)). F-26, the Pages workflow failing on `main` until the owner
enabled GitHub Pages, is closed: the sample report is live since 2026-10-25.

### Pending owner checks

The automated part passed; these manual checks were with the owner when the matrix was reviewed, and the matrix still
lists them as pending. State on 2026-11-16:

| Id      | Check                                                                                     | State                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| RF-402  | One live OpenAI call: `npm run live:openai <model>`.                                      | Done on 2026-10-13, as reported by the owner; the evaluation of 2026-10-21 also ran `gpt-5-nano` live.             |
| RF-800  | Enable GitHub Pages for the repository and open the published sample report (card P1-50). | Done: the sample report is live since 2026-10-25.                                                                  |
| RF-802  | Record the video, publish the slides and the video, and fill in both URLs (card P1-53).   | Done: both URLs are in the README and the hand-in, and the hand-in was submitted on 2026-10-26.                    |
| RF-1002 | Watch the live agent view during a real run (the owner's gate G-08 re-test).              | No record of the check in the repository; still the owner's. The live view is used in every run on the hosted app. |
| RF-1107 | Sign in with the teacher account on the hosted URL (card P1-55).                          | Done: the teacher account signed in on the hosted URL on 2026-10-24 and the smoke test signs in on every deploy.   |

### Links

- Repository: <https://github.com/blacklight0101/Rosetta>
- Sample report: <https://blacklight0101.github.io/Rosetta/> (live since 2026-10-25).
- Hosted application: <https://ca-rosetta.nicewater-1ef3fc33.spaincentral.azurecontainerapps.io> (live since 2026-10-24, before the milestone).
- Slides: <https://github.com/blacklight0101/Rosetta/blob/main/docs/hand-in/slides/Rosetta-Hito1.pdf>
- Video: <https://youtu.be/Zu1SmxuRm6Y>
