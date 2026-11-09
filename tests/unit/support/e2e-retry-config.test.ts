import { afterEach, describe, expect, it, vi } from 'vitest';

// P8-54 (RNF-005, ADR-025): the e2e-shard jobs set ROSETTA_E2E_RETRIES=1, so a failed test runs once
// more and one flake does not cost a full run; anywhere else a test runs once, so a flake stays red
// on the machine where it is fixed. The flaky reporter names a test that passed only on the retry.

async function loadConfig(retries: string | undefined) {
  vi.resetModules();
  vi.stubEnv('ROSETTA_E2E_RETRIES', retries);
  return (await import('../../../playwright.config.js')).default;
}

describe('playwright.config.ts, the retry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('RNF-005 with ROSETTA_E2E_RETRIES=1 a failed test is retried once', async () => {
    expect((await loadConfig('1')).retries).toBe(1);
  });

  it.each([undefined, '', '0', '2', 'yes'])(
    'RNF-005 with ROSETTA_E2E_RETRIES=%s a test runs once',
    async (value) => {
      expect((await loadConfig(value)).retries).toBe(0);
    },
  );

  it('RNF-005 the list reporter and the flaky reporter both report the run', async () => {
    expect((await loadConfig(undefined)).reporter).toEqual([
      ['list'],
      ['./tests/e2e/support/flaky-reporter.ts'],
    ]);
  });
});
