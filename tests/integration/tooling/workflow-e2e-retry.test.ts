import { describe, expect, it } from 'vitest';
import { ci, ciJob } from '../../support/workflow-files.js';

// P8-54 (RNF-005, ADR-025): one flaky e2e test cost a full run of every job (the P8-50 note,
// docs/runbooks/ci-throughput.md). The e2e shards retry a failed test once; playwright.config.ts reads
// ROSETTA_E2E_RETRIES and tests/e2e/support/flaky-reporter.ts reports a test that passed on the retry.

describe('GitHub Actions workflows: e2e retry', () => {
  it('RNF-005 the e2e shards retry a failed test once, and only they do', async () => {
    const shard = await ciJob('e2e-shard');
    const step = shard.slice(shard.indexOf('run: node scripts/run-e2e.mjs'));

    expect(step).toMatch(/^ {10}ROSETTA_E2E_RETRIES: 1$/mu);
    expect((await ci()).match(/ROSETTA_E2E_RETRIES/gu) ?? []).toHaveLength(1);
  });

  it('RNF-001 the e2e check keeps its name and still fails when a shard failed', async () => {
    const check = await ciJob('e2e');

    expect(check).toMatch(/^ {4}name: e2e$/mu);
    expect(check).toContain('test "$RESULT" = success');
  });
});
