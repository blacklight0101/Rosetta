---
type: journal
date: 2026-10-11
decisions: DEC-96..DEC-101
---

# 2026-10-11 - Build plan

Curated summary of the working session (DEC-38). No conversation is recorded here.

The build plan turns release 1 into task cards that agents build and verify. Cutting the cards surfaced four
contradictions between the plan template and earlier decisions; the owner resolved them and changed two working
rules so the build can run while they are away.

| Topic              | Outcome                                                                                                                                                                                                                                                                   | Why                                                                                                                                 | Ids     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Merging            | The orchestrator opens the issue and the pull request of each card and merges it itself with squash, only when CI is green, the verifier's PASS is posted and the branch is current; changes to the spec, ADRs, decision log, RFC or `CLAUDE.md` still wait for the owner | Reviewing every task would cost the owner too much time and stop the build when they are away; the merge rules keep the quality bar | DEC-96  |
| Estimate           | The basic estimate moves into P1; its confirmation threshold and accuracy stay in P2                                                                                                                                                                                      | The milestone's start page shows an estimate                                                                                        | DEC-97  |
| Answers file       | Generating `answers.md` moves into P1; re-running with answers stays in P2                                                                                                                                                                                                | Answering in the page needs the file                                                                                                | DEC-98  |
| Gates              | The protocol uses the gate names already in `handoff.md`, each with the cards it blocks                                                                                                                                                                                   | One definition per gate                                                                                                             | DEC-99  |
| Throughput         | Up to 3 agents at once, throttled against the 5-hour usage window: from 75% no new agents so 3 drop to 2, from 90% to 1, hold at 95% and resume after the reset; the orchestrator runs on Opus 5.5                                                                        | The build must never stop for lack of credit                                                                                        | DEC-100 |
| Scope and defaults | Cards for all of release 1; issues after the plan is merged; the owner chooses the host and records the video; G-03 opened                                                                                                                                                | Traceability for the G-01 review; only the owner holds accounts and gates                                                           | DEC-101 |
| Packages           | Two packages the plan needs and the baseline lacked (tarball extraction, gitignore matching) are proposed in an ADR for the owner's review                                                                                                                                | A builder must not pick a security-sensitive package on its own                                                                     | ADR-019 |
