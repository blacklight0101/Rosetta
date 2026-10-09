# ADR-012: Serve a live local web UI and read legacy code only from public GitHub snapshots

**Date**: 2026-10-10
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

The owner wants a very verbose, graphic web page that shows the agents Rosetta spawns and their progress while a
legacy project is processed (DEC-46), runs started from both the terminal and the browser (DEC-47), and legacy code
taken only from public GitHub repositories, never from a local folder (DEC-48). ADR-002 described a CLI with no
server; DEC-14 said no server. Keys must stay on the user's machine (ADR-006), and every citation must stay checkable
(ADR-005).

## Options Considered

1. A local web UI: the CLI starts an HTTP server bound to the loopback interface, serves a single-page app, and pushes
   run events over server-sent events; the same events are written to `events.jsonl` so the static report can replay
   them. Sources come from a GitHub snapshot (tarball) of an exact commit, cached by commit SHA and read-only.
2. A hosted public web app where anyone pastes a GitHub URL.
3. Terminal output only, plus the static report.
4. Do nothing: keep local folders as input and no live view.

## Decision

We choose option 1.

- **Server**: `node:http` in `src/presentation/web/`, bound to `127.0.0.1` on a free port, started by `rosetta ui`
  or by any run command (which opens the browser unless `--no-ui`). It checks the `Host` and `Origin` headers and a
  per-session token in the URL to block other sites and DNS rebinding; API keys never reach the browser.
- **Live data**: the application layer publishes typed run events (agent spawned, turn, tool call, card proposed,
  claim verified, usage, state changes) to a `RunEventSink` port; adapters fan them out to the terminal, to
  server-sent events and to `events.jsonl` in the run folder.
- **Front end**: a small component library shared by the live UI and the static report (the report renders the same
  components and replays `events.jsonl`); the library choice is Q-14 (default Preact with Vite).
- **Sources**: input is a public GitHub URL (`https://github.com/<owner>/<repo>[/tree/<ref>[/<subpath>]]`). Rosetta
  resolves the ref to a commit SHA through the GitHub REST API, downloads that snapshot, extracts it into
  `rosetta-out/sources/<owner>__<repo>@<sha>/`, and treats it as read-only. Every citation also links to
  `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<start>-L<end>`. An optional `GITHUB_TOKEN` (read-only) raises
  API rate limits; private repositories are refused.

## Rationale

- Loopback serving gives the live, graphic experience without hosting, accounts or paying for strangers' runs.
- One event stream feeds terminal, browser, audit log and replay, so the published report can show the agents at
  work (RF-506), which is the milestone's demo.
- Commit-pinned snapshots make runs reproducible (RNF-004) and citations permanent links anyone can check.
- Option 2 needs hosting, rate limiting, key management and a database (PostgreSQL per DEC-37) and is out of release 1;
  option 3 misses DEC-46; option 4 contradicts DEC-48.

## Consequences

**Positive**
- A strong live demo; the same components make the published report interactive.
- Input is uniform and public, so every result can be checked by anyone.

**Negative**
- A front-end toolchain and a small HTTP server enter the project; the web UI needs its own tests and accessibility
  checks (RNF-010).
- Network access to GitHub is required to fetch a project (cached afterwards); RNF-011 now means "after the snapshot is
  cached".
- Local folders and private repositories are not supported in release 1.

## References

- DEC-14 (amended), DEC-37, DEC-46, DEC-47, DEC-48; Q-13, Q-14.
- RF-001, RF-120..RF-126, RF-506, RF-1000..RF-1009; RNF-004, RNF-010, RNF-011.
- Amends ADR-002 (a loopback server is added); refines ADR-005 (permalinks) and ADR-006 (read-only snapshot).
