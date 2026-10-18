# Release notes

One section per release, newest first. A release is a pull request that bumps `package.json` and adds its section
here; after it merges, the owner creates the tag `vX.Y.Z` and a GitHub release with the same notes
([environments-and-delivery.md](environments-and-delivery.md) section 8, DEC-29). Versions follow Semantic Versioning
in 0.x.

Every requirement id below is backed by the [milestone verification matrix](verification/m1-matrix.md), the evidence
for the P1 exit criterion. The notes claim nothing the matrix marks as a gap, and they name the manual checks that are
still with the owner.

## v0.1.0 - Milestone 1: the scan and understand slice

|                    |                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**         | Prepared by card P1-52; not tagged yet. The owner creates the tag `v0.1.0` and the GitHub release after this version merges.                      |
| **Milestone date** | 2026-10-26 (DEC-29)                                                                                                                               |
| **Version**        | 0.1.0, as reported by `GET /healthz` and recorded in every run manifest (RF-1303)                                                                 |
| **Evidence**       | the matrix, reviewed on `main` at `6cb4d0e8` (card P1-49)                                                                                         |
| **Run it**         | the [README quick start](../README.md#quick-start) and the [local runbook](runbooks/local.md): Docker Compose, one image, `http://127.0.0.1:8080` |

Rosetta turns a public GitHub repository into an evidence-cited functional specification. This first release is the
slice of that pipeline that was planned for the milestone: it pins a commit, maps the code without AI (`scan`), lets
read-only agents write cards that cite file and line ranges and rejects the claims the code does not support
(`understand`), shows every agent live with its tokens and cost, and publishes a replay of a run. It is a web
application with accounts, and it runs on your machine with Docker Compose.

### What v0.1.0 delivers

Grouped by requirement area. "Pending" marks an automated check that passes and a manual check that is still with the
owner (see Pending owner checks). Each id has passing tests in the matrix except where marked.

| Area                             | Requirements                                                                                                                                                                                           | What you get                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects, configuration and runs | RF-002, RF-003, RF-005, RF-007, RF-008, RF-009, RF-010                                                                                                                                                 | Create a project from a public GitHub URL, validate its configuration, record every run, never write to a snapshot, stable `RST-xxxx` error codes, a zip export of a run and an application log.                                                                                                                                                                                                                                                                       |
| Scan and file access             | RF-100, RF-101, RF-102, RF-103, RF-104, RF-105, RF-106, RF-110, RF-111, RF-112, RF-120, RF-121, RF-122, RF-123, RF-124, RF-125, RF-126, RF-127, RF-140, RF-141, RF-142, RF-143, RF-145, RF-146, RF-147 | A deterministic code map of any stack (languages, entry points, embedded SQL, areas), a C# language pack with a coarse fallback for other languages, pinned and cached GitHub snapshots with subpath and rate-limit handling, citation links to GitHub, an ignore file, secret masking before anything leaves the machine, an egress record, a warning before a cloud provider is used, labelled data blocks for analysed code, bounded grep and a built-in deny list. |
| Understand                       | RF-200, RF-201, RF-202, RF-203, RF-204, RF-205, RF-240                                                                                                                                                 | Agent tasks planned per area, a read-only tool loop, valid evidence cards with stable ids, cards and a specification written to the run folder, support for models without native tool calling and the open questions collected for the owner.                                                                                                                                                                                                                         |
| Verifier                         | RF-300, RF-302                                                                                                                                                                                         | A citation check that every cited file and line range exists, and rejected claims that are kept and marked, never deleted.                                                                                                                                                                                                                                                                                                                                             |
| Providers and cost control       | RF-400, RF-401, RF-402 (pending), RF-405, RF-406, RF-407, RF-408, RF-420, RF-421, RF-422, RF-424, RF-425, RF-426, RF-428                                                                               | One provider port with an Ollama adapter and an OpenAI adapter, a model per role, retries that fail cleanly, a Test button for each provider, a provider call log, a price table, every call metered, a hard cap per run, a live cost meter, an estimate before a run (first scenario), a cost report and a project cost ledger.                                                                                                                                       |
| Report                           | RF-504, RF-506, RF-507                                                                                                                                                                                 | A Markdown report for the milestone, a replay of the agents' work and repository and model text rendered as escaped text, never as HTML.                                                                                                                                                                                                                                                                                                                               |
| Hand-in artefacts                | RF-800 (pending), RF-802 (pending)                                                                                                                                                                     | The sample report as a static site for GitHub Pages and the slides and video script in Spanish, with the URLs still to fill in.                                                                                                                                                                                                                                                                                                                                        |
| Web UI                           | RF-1001, RF-1002 (pending), RF-1003, RF-1004, RF-1005, RF-1006, RF-1007, RF-1008, RF-1009, RF-1010, RF-1011, RF-1012, RF-1013                                                                          | Start a run from the browser, watch every agent live, live cost and budget, the verification view, the coverage map, stored run events, answers to open questions in the page, run history and downloads, protection of every request, project tokens and cost always visible, provider calls and logs, deletion of snapshots and runs, security headers and cookies.                                                                                                  |
| Accounts, sessions and keys      | RF-1100, RF-1101, RF-1102, RF-1103, RF-1104, RF-1105, RF-1106, RF-1107 (pending), RF-1108, RF-1109                                                                                                     | Sign in with a user name and password, sessions and sign-out, administrator-managed accounts, password change, your own provider keys stored encrypted, private workspaces, usage caps, a teacher account, a run queue and a security audit trail.                                                                                                                                                                                                                     |
| Landing page                     | RF-1200, RF-1201                                                                                                                                                                                       | A public landing page and its reach settings.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Container and deployment         | RF-1300, RF-1301, RF-1302, RF-1303, RF-1305                                                                                                                                                            | One container image, a local Docker Compose stack bound to `127.0.0.1`, migrations applied by a one-off `migrate` step before the app starts (DEC-140), a health endpoint and configuration from the environment, with a server that refuses the all-zero placeholder secret key (`RST-1008`).                                                                                                                                                                         |
| Non-functional                   | RNF-001, RNF-002, RNF-003, RNF-004, RNF-005, RNF-007, RNF-008, RNF-009, RNF-010, RNF-013, RNF-014                                                                                                      | Portability, robustness, no secret in code or output, reproducible runs, offline tests, scan speed, usability, licence review of fixtures, accessibility checks, Clean Architecture enforced by a gate and secure defaults on the local stack.                                                                                                                                                                                                                         |

### Not in v0.1.0

- The `plan` stage and its hand-off package, and the full HTML report: later phases (see the [roadmap](roadmap.md)).
- The model-based second verifier step and per-role caps beyond the run cap: phase P2.
- Providers other than Ollama and OpenAI: the milestone requirements do not cover them and the matrix has no
  evidence for them.
- The hosted deployment, and the release image published to a registry with its SBOM: card P1-55.

### Known gaps

Requirements the matrix marks as a gap, and the card that closes each:

| Id      | What is missing                                                                                                                                                                                               | Closed by                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| RF-801  | The quick start walked on a clean clone. The walk-through is recorded in the pull request of card P1-52 with the commands and their output; the matrix row stays a gap until the next revision of the matrix. | P1-52                              |
| RF-803  | The teacher's sign-in on the hosted URL the day before the hand-in.                                                                                                                                           | P1-54 (blocked on gate G-06)       |
| RF-1304 | The hosted deployment and its smoke test.                                                                                                                                                                     | P1-55 (blocked on gate G-07)       |
| RNF-011 | A scan and an understand run with Ollama only and the network off.                                                                                                                                            | P1-47 (the owner's model download) |
| RNF-016 | Hosted availability with a health check and the monthly cap.                                                                                                                                                  | P1-55 (blocked on gate G-07)       |
| RNF-017 | Page and event timing with two runs on the hosted deployment.                                                                                                                                                 | P1-55 (blocked on gate G-07)       |

Findings the matrix ranks MAJOR, none of them BLOCKING:

- **F-01** (open, card P1-157 in review): refused requests write audit rows without a bound, so a script can grow the audit table
  on a hosted deployment. It needs the owner's answer on DEC-124 first. The local stack is published on `127.0.0.1` only.
- **F-02** (fixed in card P1-158, merged after the matrix review): the serving process no longer receives the migrator
  database credentials; the `migrate` service of `compose.yaml` applies the migrations and the app holds only the
  `rosetta_app` credential (DEC-140). The matrix row keeps its reviewed state until its next revision.
- **F-03** (fixed in card P1-108): the all-zero `ROSETTA_SECRET_KEY` placeholder of `.env.example` is refused at
  start-up with `RST-1008`. This is why the quick start generates a key before the first start.

The MINOR findings F-04 to F-25 are tracked by cards P1-159, P1-160 and P1-161; P1-160 and P1-161 are merged and P1-159
is open. See [tasks.md](orchestration/tasks.md) for their state. F-26 is an owner action that matters to the sample report: the
Pages workflow fails on `main` until the owner enables GitHub Pages.

### Pending owner checks

The automated part passes; these manual checks are with the owner:

| Id      | Check                                                                                     |
| ------- | ----------------------------------------------------------------------------------------- |
| RF-402  | One live OpenAI call: `npm run live:openai <model>`.                                      |
| RF-800  | Enable GitHub Pages for the repository and open the published sample report (card P1-50). |
| RF-802  | Record the video, publish the slides and the video, and fill in both URLs (card P1-53).   |
| RF-1002 | Watch the live agent view during a real run (the owner's gate G-08 re-test).              |
| RF-1107 | Sign in with the teacher account on the hosted URL (card P1-55).                          |

### Links

- Repository: <https://github.com/blacklight0101/Rosetta>
- Sample report: <https://blacklight0101.github.io/Rosetta/>, live once the owner enables GitHub Pages.
- Hosted application: [PENDIENTE: URL de la aplicación alojada]
- Slides: [PENDIENTE: URL de las diapositivas]
- Video: [PENDIENTE: URL del vídeo]
