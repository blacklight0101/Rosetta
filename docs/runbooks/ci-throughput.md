# Runbook: CI throughput, queue time against job time

Measurement for P8-50 (GitHub issue #1152, RNF-001, RNF-005, ADR-025). This note changes no workflow, ruleset or
repository setting; every change below is a pick for the owner. Since DEC-221 P8-53 is withdrawn (pick 4), P8-51
(the merge queue) and any change to branch protection stay the owner's, and P8-52, P8-54 and P8-55 may go ahead as
ordinary pull requests; what P8-52 can safely do before the queue exists is under pick 3. The wait on P8-49 was
waived by the owner (DEC-220).

## 1. How it was measured

The last 50 runs of the `CI` workflow (`gh run list --workflow ci.yml --limit 50`), then one
`gh api repos/<owner>/<repo>/actions/runs/<id>/jobs` call per run (the REST job list, with `created_at`, `started_at`
and `completed_at` per job and per step). Queue time needs `gh api`: `gh run view --json jobs` has no `created_at`, so
it cannot give it, and the card's suggested command is not enough. Read-only; about 70 API calls out of 5000 an
hour. Per job: **queue time** = `started_at` minus `created_at` (the job waited for a runner), **job time** =
`completed_at` minus `started_at`. Per run: **wall** = last job end minus run creation; **critical path** = the longest
chain `changes`, test shards, test merge, `verify` (and the other jobs after `changes`) using that run's own job times;
**excess** = wall minus critical path, i.e. what the run lost to queueing. The scripts live in the builder's scratch
space, not in the repository. Window: 2026-11-04 01:33Z to 08:16Z (6.7 hours), 31 pull request runs and 19 pushes to
`develop`; 33 passed, 3 failed, 11 were cancelled, 3 had not finished (excluded from the wall figures).

## 2. Before numbers

| Measure (median unless stated)                   | Value                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Jobs per full run                                | 22 (16 start at once after `changes`)                                    |
| Job minutes per full run                         | 96 (Windows shards 32, e2e 25, Linux tests 25, others 14)                |
| Wall of a passed run                             | 15.9 min (p90 23.6, max 28.1)                                            |
| Critical path of the same runs                   | 13.3 min                                                                 |
| Excess, queue and scheduling                     | 2.6 min (median share per run: 19% of its wall); mean 4.0                |
| Queue time of one job                            | median 0.0 to 0.1; p90 2.5 (Windows) and 3.1 (Linux); max 10.4           |
| Queue minutes against job minutes, all 50 runs   | 508 against 4179 (12%)                                                   |
| Peak running jobs, share of time at 20 or more   | 21, 10.5% (the free plan allows 20 at once; to confirm)                  |
| Excess with 0, 1, 2 other runs in flight         | 0.3, 0.4, 1.4 min (overlap over all 50 runs); n = 1, 6, 4: too few       |
| Excess with 3 or more other runs in flight       | 4.6 min (wall 18.0), n = 22 of the 33 passed runs; the only sound bucket |
| `npm ci` plus setup steps, all jobs of a run     | 11.9 plus 6.5 job minutes (19% of 96)                                    |
| Share of job minutes: pushes to `develop` / PRs  | 1525 (36.5%) / 2654 (63.5%)                                              |
| Job minutes in cancelled runs (10 are `develop`) | 756 (18.1%); `develop` alone 655 (15.7%)                                 |

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
- **What the cancelled `develop` runs cost in assurance, not only in minutes.** `docs/orchestration/README.md`
  section 3.1 rule 3 says the CI run on `develop` after each merge must go green and that a red `develop` stops every
  merge. For 10 of the 19 merges that rule **cannot be checked**: no run finished on that commit. The next `develop`
  run that survives tests the tree that contains the earlier commit, so it covers the cancelled commits together; it
  does not cover each one alone. Two things follow. First, a green surviving run proves the combined tree, which is
  what `develop` is, but a red one cannot be pinned to one of the commits it absorbed without rerunning them one by
  one (a bisect, each step a full run of 96 job minutes), and the merges that happened while it ran were allowed
  because no red was visible yet. Second, the stop-merge rule acts late: it fires when a run finally survives, not at
  the merge that broke `develop`. Rule 3 as written holds only when merges are further apart than a run (14 to 15
  min) or when a queue gives every merged batch its own run (pick 2).
- A PR's superseded run is already cancelled: `ci.yml` has `concurrency: ci-<ref>` with `cancel-in-progress: true`
  since P1-02 (#97). One of 31 PR runs was cancelled that way.
- Failures: three PR runs failed. `history-coverage-tooltip.spec.ts` failed in all four Playwright projects, the
  two journey specs of p8-56 timed out at 90 s, and a unit shard failed on both systems; all three reproduce, so they
  are not flakes. One `develop` run had a single-project, single-test timeout (`workbook-project.spec.ts`, 5 s), the
  only candidate flake in 50 runs.

## 4. Picks

Savings are computed from the 33 passed runs (each run's own job times); "floor" is the critical path without queue.

| #   | Pick                                                                                                                     | Saves, and how                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Shorten the Windows chain: drop the Windows coverage merge, balance the Windows shards                                   | Floor 13.3 to 10.8 min (2.5 min: 19% of the floor, 16% of the 15.9 median wall): without the 1.8 min merge job the chain is 11.7 (1.6 min); Windows shards sum 30.8 min, so three equal shards are 10.3 against 11.5 today (0.9 min more). The Linux path (shard 8.3 plus merge 1.4) then sets the floor, so a fourth Windows shard adds only 0.1 min. Frees 1.8 job minutes. Cost: the `tests (windows-latest)` merge job also enforces the Windows coverage thresholds and the check that all three blobs reported; dropping it loses the Windows-side coverage gate (Linux still enforces its own), so the thresholds do not "already run on Linux" for Windows. Keep a cheaper Windows check or accept the loss. P8-52 or new                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owner approves the workflow change; no repository setting. Balancing needs a split by file timing, not by count; not measured                                                                                                                                                                                                                                                                                                                     |
| 2   | Merge queue on `develop` (`merge_group` trigger), full suite once per batch, no separate `develop` run                   | Per 3 merges: 3 `develop` runs (80 job minutes each, 1525 over 19 pushes; this is spend per push and includes the 10 cancelled partial runs, a full run is 96) become 1 queue run (96): 144 job minutes saved (about 48 per merge, 22% of the 220 job minutes a merge costs today). This is realized spend, not full-run cost: against three full runs (288) the saving would be 192. Every merged commit gets a full run (today 10 of 19 have none). Wall per merge: about 0, since merges are no longer serial. P8-51                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **Owner.** Merge queues reportedly exist only for organisation-owned repositories; this is a user-owned public repository, so it needs a transfer. It also changes the ruleset. Merge queue availability for a user-owned repository is not confirmed against current GitHub documentation (the verifier could not load it): check the repository settings page before any transfer                                                               |
| 3   | Lighter PR runs: Windows tests, ZAP, compose smoke and image on the queue and `develop` only                             | 41.4 of 96 job minutes per PR run (43%): Windows 32.0, ZAP plus compose plus image 9.4. Wall: floor 10.7, only 0.1 min under pick 1. Real gain is contention: a PR run starts 9 jobs instead of 16, so two overlapping runs (18) fit under 20; the excess is 2.6 min median, 4.6 with three runs in flight, which bounds the gain. P8-52                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Owner** for the Windows, ZAP and compose cut: only safe with pick 2, because without a queue a Windows-only break reaches `develop` before any run sees it (RNF-001), and `develop` runs are cancelled (pick 4). Without the queue P8-52 can safely do only the path filter: a docs-only PR skips the test and e2e jobs (the `changes` job already exists; `workflow-docs-only.test.ts` covers it), which loses nothing because no code changed |
| 4   | Cancel a PR's superseded run (P8-53); and the `develop` push runs that `cancel-in-progress` also cancels                 | PR side: 0, already in `ci.yml` (group `ci-${{ github.ref }}`, lines 21-23), one PR run in 31 cancelled; P8-53 is withdrawn (DEC-221). `develop` side: the same setting cancels 10 of 19 `develop` runs (655 job minutes spent, no result), so rule 3 of README section 3.1 is unchecked for 10 merges (section 3). **Option, not a decision**: stop cancelling `develop` push runs, for example `cancel-in-progress: ${{ github.ref != 'refs/heads/develop' }}` with the group keyed by `github.sha` on `develop` (without the key, GitHub keeps only one pending run per group and would still drop the older pending ones; GitHub docs, not tested). Cost: 10 full runs would be 960 job minutes against the 655 spent, so +305 job minutes in 6.7 hours (+7.3% of the 4179), plus more runs in flight at once (the 3 or more bucket is already 4.6 min excess), which is not measured. Gain: every merged commit gets its own verdict and a red `develop` is pinned to one commit. That is a change to `ci.yml` only, so an ordinary CI card; it touches no branch protection, so it is not the owner's under DEC-221 unless it adds or changes a required check. Pick 2 gives the same assurance more cheaply (one queue run per batch), but needs the organisation transfer; until then this option is the only way to check rule 3 for every merge, and merging more slowly than a run (one merge per 15 min) is the free alternative | Owner decides between: do the option now, wait for pick 2, or keep the current gap. Closing P8-53 as done stands                                                                                                                                                                                                                                                                                                                                  |
| 5   | Retry an e2e test once in CI and report a pass on retry (P8-54)                                                          | At most 1 rerun in 50 runs (2%, about 9 min for a shard), as only one failure looks like a flake. A real failure costs 1.1 min more per project (4 projects), so it adds wall to red runs. Low value; do it for the report, not the time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner approves the workflow change                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | Cache `node_modules` by lock file hash (or keep `npm ci` and cache only the Playwright and Docker layers already cached) | Estimate, not measured: `npm ci` is 64 s on the Windows chain and 11.9 job minutes (12%) per run; a restore might take 20 to 30 s on Linux and more on Windows. Up to 0.7 min of wall. Measure on a throwaway PR first; native modules make it risky                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner approves the workflow change                                                                                                                                                                                                                                                                                                                                                                                                                |

Order that gives the most for the least change: pick 1 now (no setting, 2.5 min), then pick 2 and 3 together once the
repository is organisation-owned (job minutes down 27% overall: 144 per three merges plus 41 per PR run), and leave
picks 5 and 6 as they are or small. Pick 4 is no longer "leave it": until pick 2 exists, stopping the cancellation of `develop` runs is the only way to run rule 3 for each merge, for about 7% more job minutes.

## 5. Re-measure

After each change run the same query on the next 50 runs and compare with section 2: wall, excess, and the share of
cancelled `develop` runs. A merge queue changes what a `develop` run is, so count queue runs separately.

## 6. Changes made

### P8-54: retry a flaky e2e test once and report it (pick 5)

The `e2e-shard` jobs set `ROSETTA_E2E_RETRIES=1`, and `playwright.config.ts` then retries a failed test once (0
retries anywhere else, so a flake stays red on a developer's machine). A test that passes on the retry is flaky: the
shard stays green, Playwright's list counts it as flaky, and `tests/e2e/support/flaky-reporter.ts` writes one summary
line, "Flaky e2e tests: N passed only on retry.", with the tests by project, file and title to the log, as a
`::warning` annotation per test and to the job summary. The `e2e` check name and its rule (green only when every
shard passed) are unchanged, so no ruleset changes.

- **Saves**: one full rerun per flake, 96 job minutes and a 15.9 min median wall (plus its wait for runners). Over the
  50 measured runs that is at most 1 rerun (the one candidate flake, about 2% of the 4179 job minutes); on the
  evidence of 2026-11-02 (`live-run-controls.spec.ts`, about five extra full runs) it would have saved about 480 job
  minutes and 80 min of wall.
- **Costs**: nothing on a passed run. A real failure runs each failing test once more, so a red shard takes that
  test's time again, up to its timeout (Playwright's 30 s by default, 90 s to 7 min for the 66 tests that set their
  own; the 1.1 min per project of section 4). A test that fails on the retry too still fails the shard.
- **Re-measure**: count the "Flaky e2e tests" lines in the job summaries of the next 50 runs; each one is a full run
  saved, and each named test is a flake to fix rather than to leave to the retry.

### P8-142: quarantine confirmed flaky tests and stress new tests (DEC-227)

P8-54 keeps one flake from costing a full run, but a test that keeps flaking stays in a required check with no owner,
and a new test becomes required the moment it merges, having run once. Two non-required jobs of `ci.yml` close both
gaps; the eight required check names do not change, so the ruleset does not either.

- **The quarantine list** is `tests/quarantine.json`, a JSON array, empty to start with. Each entry names one test:
  `file` (its path from the repository root), `title` (the describe blocks and the test title, in order; a shorter
  list quarantines a whole describe block), `owner` (the GitHub login who fixes or removes it), `issue` (the number of
  its GitHub issue), `until` (the last day, `YYYY-MM-DD`, UTC, the entry applies) and `flakeRun` (the URL of the CI run
  that confirmed the flake, `https://github.com/<owner>/<repo>/actions/runs/<id>`).
- **Joining it**: a test joins only after a flake that the P8-54 report confirms. For a Playwright test, `flakeRun` is
  the run whose job summary has the line "Flaky e2e tests: N passed only on retry." naming that test; the reviewer of
  the pull request that adds the entry opens it. The tests run offline (RNF-005), so the guard below checks only the
  shape of the URL, not the run. A Vitest test has no retry report: its `flakeRun` is the run where it failed on a
  commit that passed on a rerun.
- **Skipped in the required checks**: in `verify`, the setup file `tests/support/quarantine-setup.ts` of every Vitest
  project skips a listed test, which the report shows as skipped; in `e2e`, `scripts/run-e2e.mjs` writes the
  Playwright entries to `test-results/quarantine.txt` and passes Playwright's `--test-list-invert`. A quarantined test
  that fails therefore never holds a merge.
- **Still run and reported**: the job `quarantine` (check `quarantined tests (not required)`) runs only when the list
  has an entry and the change is code. `node scripts/quarantine-run.mjs` writes every entry (test, owner, issue,
  until, flake run) to the job summary, then runs only the listed Vitest tests (`ROSETTA_QUARANTINE=only`) and only the
  listed Playwright tests (`--test-list`), once each and without a retry. The check is red while a quarantined test
  still fails; it is not required, so that blocks nothing.
- **The guard**: `tests/integration/tooling/quarantine-list.test.ts`, part of `verify`, fails when an entry is past its
  `until` date, has no owner, no issue or no flake run, names a file that no longer exists, or has a malformed field.
  An expired or ownerless entry therefore turns the required `verify` red on the next code change, so it is fixed,
  extended with a new date in a reviewed pull request, or removed.
- **Leaving it**: the pull request that fixes the test removes its entry. Its file changed, so the stress job runs it.

**The stress job.** The job `test-picks` (check `pick quarantined and changed tests`) checks out only
`tests/quarantine.json` and, on a pull request, lists the pull request's own files with
`gh api --paginate repos/<repo>/pulls/<n>/files` (removed files left out, a renamed file under its new path). It keeps
the test files: `tests/**/*.test.ts`, `tests/**/*.test.tsx` and `tests/e2e/**/*.spec.ts`. It does not use
`vitest --changed`, which follows imports and misses tests that read the documents. When no test file changed, the job
`stress` (check `stress changed tests (not required)`) is skipped: a pull request without test changes pays only the
few seconds of `test-picks`. It is also skipped on a release pull request (base `main`): a release reruns every changed
test of the release, which hit its 20-minute limit with PostgreSQL "too many clients" on #1351, while each card had
already passed its own stress run (DEC-227). Otherwise `node scripts/stress-tests.mjs` runs only those tests:

- Vitest: `vitest run <files> --sequence.shuffle --sequence.seed=<seed> --repeats=4 --retry=0`, so every test runs five
  times, the files in parallel workers and the files and tests in a shuffled order; the seed is printed, so a failing
  order can be replayed with the same command.
- Playwright: `node scripts/run-e2e.mjs <specs> --repeat-each=5 --workers=4 --retries=0`, five runs of every test
  spread over four workers (two by default) against one test server. Playwright has no shuffle option; with
  `fullyParallel` the repeats interleave across the workers, so their order changes from run to run.

A test that fails once fails the job (no retry). The check is not required; a red one means the new or changed test
is not ready, and the pull request should not merge until it is green.

- **Costs**: on a pull request without test changes only `test-picks` runs (one file checked out, one API call; not
  measured yet); otherwise `npm ci`, Chromium from its cache and five runs of the changed tests only.
- **What only a real flake shows**: that `flakeRun` really names a test the P8-54 report printed, and that a test
  that fails one run in five fails the stress check on GitHub, are only seen on a real run.

### P8-140: fetch only the history a job reads (DEC-227)

Each checkout now fetches only the git history its job reads (the list is in `docs/environments-and-delivery.md`
section 6, "Git history per job"). Before, five checkouts fetched every branch and tag with their whole history.

- **Before, measured** from the job logs of the 35 completed `CI` runs of 2026-11-08 15:17Z to 19:26Z (22 pull
  request runs, 13 pushes to `develop`; `gh api .../actions/jobs/<id>/logs`, the time from the checkout step's first
  line to the next step, and inside it the "Fetching the repository" group). Median checkout step / fetch, in seconds:
  `changes` 3.6 / 2.7 on a pull request and 3.9 / 2.9 on a push; `gitleaks` 3.6 / 2.6 and 3.7 / 2.7; for
  comparison `audit` in the same runs, which already fetched one commit, 2.4 / 1.4 and 2.3 / 1.4. `release.yml`, the
  5 `workflow_dispatch` runs of 2026-10-24 to 2026-11-03: `image` 2.9 / 2.1, `deploy` 3.2 / 2.3 (3 runs).
  `release-checks.yml` had no run yet.
- **After**: to be measured on the CI run of this card's pull request (`changes`, `gitleaks`) and on the next release
  (`image`, `deploy`, `checks`), with the same method; no figure is stated until then. The `audit` figure above is
  only what a one-commit fetch took in the same runs, not a measurement of the changed jobs.
- **Saves**: about a second per changed job per run if the changed jobs come down to the `audit` figure, and it grows
  with the history; small next to the 96 job minutes of a run (section 2).

### P8-55: caches, and the after numbers

**Method.** The same as section 1 and P8-140, read-only: `gh api .../actions/workflows/ci.yml/runs` for the runs of
2026-11-08 from 15:00Z, then `gh api .../actions/runs/<id>/jobs` per run (job and step times) and
`gh api .../actions/jobs/<id>/logs` for the times inside a step (Vite's "built in", BuildKit's per-layer `DONE`).
Wall is the last job's end minus the run's creation; a run counts as "runners free" when no job of it waited more than
0.1 min for a runner. Measured, not estimated, unless a line says otherwise. The scripts stay in the builder's scratch
space.

**The three caches.**

- _Playwright browsers_: already cached since P1-183 (key on the Playwright version). Measured: the restore takes 1
  to 5 s and the install check 1 to 2 s per job. Nothing to add.
- _Web bundle_: **not added; the premise does not hold.** Each e2e shard runs `vite build` inside
  `scripts/run-e2e.mjs`; in the six shards of runs 42521937025 and 42520783898 Vite reported "built in" 195 to 354 ms,
  under a second from the step's start. An `actions/cache` restore of the browser folder in the same jobs took 1 to
  5 s, so a cached bundle would be slower than building it, and would add a key to keep right. The 40 to 62 s between
  the build and the first test is the start of the Playwright web server (`tests/e2e/support/serve.ts`), not the
  build.
- _Image layers_: **added, in the `image` job.** Before, measured in run 42521937025 (job 128857160098): the runtime
  `docker build` took 81 s, of which the base image 3.2 s, `npm ci` of the build stage 55.0 s (the production
  `npm ci` of the `deps` stage, 9.2 s, runs beside it), `npm run build` 13.3 s, `apt-get upgrade` 4.6 s and the
  export 2.7 s; the test image took 18 s more. Over the 35 code runs of the day from 15:00Z the image builds and the two Compose
  stack starts (which build the image again) took 246 to 328 s per run. Now `docker/build-push-action` builds both
  images with BuildKit and keeps the layers in the GitHub Actions cache (`docs/environments-and-delivery.md`,
  section 6, "Caches"): only a push writes it, the `runtime` stage is always rebuilt so its `apt-get upgrade` is never
  stale, every other layer is keyed by BuildKit on the content it copies.
  - **Saves, upper bound** (from the times above, not measured with the cache): the 55 s `npm ci` layer whenever
    `package-lock.json` did not change, and the 13 s build whenever `src/` and `web/` did not change, so at most about
    1.1 job minutes of the run's 92 to 101. It saves **no wall**: the `image` job ends at +3.5 min and the run's
    critical path (the Windows test chain) at +12.8 min. The cost of the BuildKit container, the cache download and
    loading the image into Docker is not measured yet.
  - **Only real runs can show it**: this card's own pull request reads `develop`'s cache, which is empty until the
    first push to `develop` after the merge writes it, so its run shows only the cold cost; the first `develop` run
    after that and the pull requests after it show the saving. No figure is stated until then; measure the `image`
    job's two build steps against the 81 s and 18 s above.
  - **Not cached**: `compose-smoke` and `zap-baseline` still build with `docker compose up --build` (95 to 109 s and
    91 to 104 s for "Start the stack" in today's runs), which checks the `build:` sections of the Compose files that
    local deployment uses and cannot reach the GitHub Actions cache. Caching them means building the images with
    `docker/build-push-action` first and dropping `--build`, which loses that check; that is the owner's pick.

**After numbers, this group (P8-54, P8-140, P8-141, P8-142, and P8-55 still to come).**

| Measure                                                                  | Before (section 2, 2026-11-04)  | After (2026-11-08)                                                |
| ------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------- |
| Wall of a passed code run, runners free                                  | 13.6 min ("quiet runner pool")  | median 13.3, range 12.1 to 13.8 (n = 10 passed)                   |
| The same, only runs with today's full `ci.yml` (25 jobs, from 20:07Z)    | -                               | median 13.4, range 12.9 to 13.9 (n = 5; one red on gitleaks only) |
| Wall of a passed code run, every run                                     | median 15.9, p90 23.6           | median 14.8 (n = 29 passed code runs)                             |
| Wall of a passed code run with a job queued 8 min or more (15:04-16:28Z) | 18.0 (3 or more runs in flight) | median 38.3, range 23.0 to 56.6 (n = 10; queue 8.4 to 28.1)       |
| Job minutes of a code run                                                | 96                              | 88.5 to 103.4; median 94.1 for the 25-job runs                    |
| Longest job                                                              | Windows shard 1, 11.5           | a Windows shard, 11.2 to 12.1 (shards not balanced)               |

How the busy row is counted (reconciled 2026-11-08, P8-143): the passed `ci.yml` runs created from 15:04Z to 16:28Z
with a job queued 8 min or more, without the pull request run 42492954128 of `docs/ci-cards-from-video` (a docs branch,
not a code run), and the wall from the run's `created_at` to its `updated_at`. That counts the 13 min run 42495274413
waited in its concurrency group before its first job was created. Counted from the first job created to the last job
completed, with the docs run, the same window gives 11 runs, median 37.2, range 23.0 to 56.6 (the verifier's reading);
both readings say the same thing: queue time, not work, made the busy runs slow.

**Done when: "a PR's CI finishes in under 15 min wall clock when runners are free".** It holds, measured: every code
run of the day that passed with free runners finished in 12.1 to 13.8 min (median 13.3), the pull request run 42521937025 on today's full
workflow in 12.9 min. It held before this group too (13.6 min on a quiet pool, section 3); the group did not move it,
and no cache can: the critical path is the Windows test chain (a shard of up to 12.1 min, the 1.6 to 1.8 min merge job,
`verify`). It does **not** hold when runners are busy: the ten passed code runs of 15:04Z to 16:28Z, while a burst of
pull requests was in flight, took a median of 38.3 min; what they took over 13 min was queue time. Only P8-51 (one queue run per batch) and
P8-52 (fewer jobs per pull request run) reduce that, and both wait on the owner; picks 1 and 3 of section 4 are what
would move the free-runner figure.
