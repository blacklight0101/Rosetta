/**
 * The one timeout of the understand integration tests (P2-32, #480). Measured on Windows with a
 * second Vitest run going: a scan and an understand run take about 3 s alone and 6 to 18 s under
 * that load, and 64 s once, when other agents also used the disk (the run spends its time in the
 * path checks of the output writer: about 1,800 `realpath` and 2,600 `lstat` calls per run).
 * `UNDERSTAND_RUN_WAIT` bounds the wait for one run (about twice the worst run seen); a test or
 * hook may chain three such runs, so it gets three times that wait. A hang still fails, only later.
 */
export const UNDERSTAND_RUN_WAIT = 120_000;
export const UNDERSTAND_TIMEOUT = { timeout: 3 * UNDERSTAND_RUN_WAIT } as const;
