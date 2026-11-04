# Runbook: CI throughput, queue time against job time

Measurement for P8-50 (GitHub issue #1152, RNF-001, RNF-005, ADR-025). This note changes no workflow, ruleset or
repository setting; every change below is a pick for the owner, and P8-51 to P8-54 carry them out. The wait on P8-49
was waived by the owner (DEC-220).

## 1. How it was measured

The last 50 runs of the `CI` workflow (`gh run list --workflow ci.yml --limit 50`), then one
`gh api repos/<owner>/<repo>/actions/runs/<id>/jobs` call per run (the job list that `gh run view --json jobs` shows,
with `created_at`, `started_at` and `completed_at` per job and per step). Read-only; about 70 API calls out of 5000 an
hour. Per job: **queue time** = `started_at` minus `created_at` (the job waited for a runner), **job time** =
`completed_at` minus `started_at`. Per run: **wall** = last job end minus run creation; **critical path** = the longest
chain `changes`, test shards, test merge, `verify` (and the other jobs after `changes`) using that run's own job times;
**excess** = wall minus critical path, i.e. what the run lost to queueing. The scripts live in the builder's scratch
space, not in the repository. Window: 2026-11-04 01:33Z to 08:16Z (6.7 hours), 31 pull request runs and 19 pushes to
`develop`; 33 passed, 3 failed, 11 were cancelled, 3 had not finished (excluded from the wall figures).

## 2. Before numbers

| Measure (median unless stated)                   | Value                                                          |
| ------------------------------------------------ | -------------------------------------------------------------- |
| Jobs per full run                                | 22 (16 start at once after `changes`)                          |
| Job minutes per full run                         | 96 (Windows shards 32, e2e 25, Linux tests 25, others 14)      |
| Wall of a passed run                             | 15.9 min (p90 23.6, max 28.1)                                  |
| Critical path of the same runs                   | 13.3 min                                                       |
| Excess, queue and scheduling                     | 2.6 min (19% of wall); mean 4.0                                |
| Queue time of one job                            | median 0.0 to 0.1; p90 2.5 (Windows) and 3.1 (Linux); max 10.4 |
| Queue minutes against job minutes, all 50 runs   | 508 against 4179 (12%)                                         |
| Peak running jobs, share of time at 20 or more   | 21, 10.5% (the free plan allows 20 at once; to confirm)        |
| Excess with 0, 1, 2 other runs in flight         | 0.2, 0.7, 1.4 min                                              |
| Excess with 3 or more other runs in flight       | 4.6 min (wall 18.0), and 22 of the 33 passed runs were these   |
| `npm ci` plus setup steps, all jobs of a run     | 11.9 plus 6.5 job minutes (19% of 96)                          |
| Share of job minutes: pushes to `develop` / PRs  | 1525 (36.5%) / 2654 (63.5%)                                    |
| Job minutes in cancelled runs (10 are `develop`) | 756 (18.1%); `develop` alone 655 (15.7%)                       |

Longest jobs (median job time, minutes): tests Windows shard 1 11.5, shard 3 10.8, shard 2 8.5; e2e shard 3 9.1, shard
2 8.6, shard 1 7.5; tests Linux shards 8.3, 8.0, 7.9; `gates` 4.8; compose smoke 3.3; image 3.2; ZAP 3.1; the Windows
test merge job 1.8 and the Linux one 1.4. The Windows chain (`changes`, shard 1, merge, `verify`) is the critical
path of most runs.

## 3. What changed since the evidence of 2026-11-02

- A run now takes 13.6 min on a quiet runner pool and 15.9 min as a median, against 25 to 40 min. The slowest passed
  run was 28.1 min, in the hour where the excess was 8 to 10 min with three or more runs in flight.
- The merge script no longer updates a PR before merging: 21 PR branches had 31 runs (1.5 per branch); four runs
  repeat an earlier passed run of the same branch (p8-89 twice, p8-105, p8-106) and three follow a failure. Merges are
  no longer serial: 19 pushes to `develop` in 6.3 hours (3.0 an hour, against about 1.7 on 2026-11-02).
- **`develop` runs are cancelled by the next merge**: 10 of 19. The median gap between pushes is 15.6 min and a run
  needs 14 to 15, so any merge within that gap cancels the previous `develop` run. Those 10 commits have no finished
  run on `develop`; their only full run is the one on the PR, on an older base. The 10 cancelled runs spent 655 job
  minutes for no result.
- A PR's superseded run is already cancelled: `ci.yml` has `concurrency: ci-<ref>` with `cancel-in-progress: true`
  since P1-02 (#97). One of 31 PR runs was cancelled that way.
- Failures: three PR runs failed. `history-coverage-tooltip.spec.ts` failed in all four Playwright projects, the
  two journey specs of p8-56 timed out at 90 s, and a unit shard failed on both systems; all three reproduce, so they
  are not flakes. One `develop` run had a single-project, single-test timeout (`workbook-project.spec.ts`, 5 s), the
  only candidate flake in 50 runs.

## 4. Picks

Savings are computed from the 33 passed runs (each run's own job times); "floor" is the critical path without queue.

| #   | Pick                                                                                                                         | Saves, and how                                                                                                                                                                                                                                                                                                                                           | Owner                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Shorten the Windows chain: drop the Windows coverage merge (the thresholds already run on Linux), balance the Windows shards | Floor 13.3 to 10.8 min (2.5 min, 19% of wall): without the 1.8 min merge job the chain is 11.7 (1.6 min); Windows shards sum 30.8 min, so three equal shards are 10.3 against 11.5 today (0.9 min more). The Linux path (shard 8.3 plus merge 1.4) then sets the floor, so a fourth Windows shard adds only 0.1 min. Frees 1.8 job minutes. P8-52 or new | Owner approves the workflow change; no repository setting. Balancing needs a split by file timing, not by count; not measured                                           |
| 2   | Merge queue on `develop` (`merge_group` trigger), full suite once per batch, no separate `develop` run                       | Per 3 merges: 3 `develop` runs (80 job minutes each, 1525 over 19 pushes) become 1 queue run (96): 144 job minutes saved (about 48 per merge, 22% of the 220 job minutes a merge costs today). Every merged commit gets a full run (today 10 of 19 have none). Wall per merge: about 0, since merges are no longer serial. P8-51                         | **Owner.** Merge queues exist only for organisation-owned repositories; this one is a user-owned public repository, so it needs a transfer. It also changes the ruleset |
| 3   | Lighter PR runs: Windows tests, ZAP, compose smoke and image on the queue and `develop` only                                 | 41.4 of 96 job minutes per PR run (43%): Windows 32.0, ZAP plus compose plus image 9.4. Wall: floor 10.7, only 0.1 min under pick 1. Real gain is contention: a PR run starts 9 jobs instead of 16, so two overlapping runs (18) fit under 20; the excess is 2.6 min median, 4.6 with three runs in flight, which bounds the gain. P8-52                 | **Owner.** Only safe with pick 2: without a queue a Windows-only break reaches `develop` before any run sees it (RNF-001)                                               |
| 4   | Cancel a PR's superseded run (P8-53)                                                                                         | 0: already in `ci.yml`, one PR run in 31 cancelled. Cancelling `develop` runs is the 655 job minute waste above; not cancelling them would run 10 more full runs, so leave it and let pick 2 remove the need. Suggest closing P8-53 as done                                                                                                              | Owner decides to close the card                                                                                                                                         |
| 5   | Retry an e2e test once in CI and report a pass on retry (P8-54)                                                              | At most 1 rerun in 50 runs (2%, about 9 min for a shard), as only one failure looks like a flake. A real failure costs 1.1 min more per project (4 projects), so it adds wall to red runs. Low value; do it for the report, not the time                                                                                                                 | Owner approves the workflow change                                                                                                                                      |
| 6   | Cache `node_modules` by lock file hash (or keep `npm ci` and cache only the Playwright and Docker layers already cached)     | Estimate, not measured: `npm ci` is 64 s on the Windows chain and 11.9 job minutes (12%) per run; a restore might take 20 to 30 s on Linux and more on Windows. Up to 0.7 min of wall. Measure on a throwaway PR first; native modules make it risky                                                                                                     | Owner approves the workflow change                                                                                                                                      |

Order that gives the most for the least change: pick 1 now (no setting, 2.5 min), then pick 2 and 3 together once the
repository is organisation-owned (job minutes down 27% overall: 144 per three merges plus 41 per PR run), and leave
picks 4 to 6 as they are or small.

## 5. Re-measure

After each change run the same query on the next 50 runs and compare with section 2: wall, excess, and the share of
cancelled `develop` runs. A merge queue changes what a `develop` run is, so count queue runs separately.
