import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { cardFiles, made, READER_CALLS, type Made } from '../../support/consolidate-run.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { understandSettings } from '../../support/understand-run-harness.js';

// RF-422, RF-250, RF-426, ADR-007, P2-35: the summariser's step is optional. A cap that refuses its
// call does not turn a run whose areas all finished into an interrupted or capped run: the run
// ends as it would without the step, the duplicate cards stay, the refusal is in the event log and
// the log, and what the readers spent stays on the ledger.

/** A run cap the readers (9,820 tokens in the recording) stay under and the summariser's worst case passes. */
const refusing = understandSettings((base) => ({
  ...base,
  roles: { ...base.roles, summariser: { ...base.roles.summariser, maxOutputTokens: 32_768 } },
  budget: { ...base.budget, run: { maxCostMicros: 50_000_000, maxTokens: 40_000 } },
}));

/** One run for the tests below, made in `beforeAll`: they only read its result. */
function useRefusedRun(): () => Made {
  const shared: { dir?: string; run?: Made } = {};
  beforeAll(async () => {
    shared.dir = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-consolidate-cap-')));
    shared.run = await made(shared.dir, { settings: refusing });
  }, UNDERSTAND_TIMEOUT.timeout);
  afterAll(async () => {
    if (shared.dir !== undefined) await rm(shared.dir, { recursive: true, force: true });
  });
  return () => {
    if (shared.run === undefined) throw new Error('The run did not start.');
    return shared.run;
  };
}

describe('an understand run whose cap refuses the summariser', () => {
  const current = useRefusedRun();

  it('RF-422 P2-35 ends Completed, as it would without the merge, with no error code', async () => {
    const { h, run } = current();

    expect(run.endState).toBe('Completed');
    const manifest = await h.manifestOf(run);
    expect(manifest.endState).toBe('Completed');
    const ended = (await h.eventsOf(run)).at(-1);
    expect(ended?.type).toBe('run.ended');
    expect(ended?.data).not.toHaveProperty('errorCode');
    expect(manifest.agentTasks.map((task) => task.state)).not.toContain('StoppedByCap');
  });

  it('RF-250 P2-35 leaves the duplicate cards as the readers wrote them', async () => {
    const { h, folder } = current();

    expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md', 'BR-002.md']);
    expect(await cardFiles(folder, 'ENT')).toEqual(['ENT-001.md', 'ENT-002.md']);
    const roles = h.providers.requests().map((request) => request.context.role);
    expect(roles).toEqual(Array.from({ length: READER_CALLS }, () => 'reader'));
  });

  it('RF-422 P2-35 records the refusal in the event log and in the log', async () => {
    const { h, run } = current();

    const events = await h.eventsOf(run);
    expect(events.filter((event) => event.type === 'budget.capReached')).toHaveLength(1);
    const refused = h.logger.entries.filter((entry) => entry.code === ERROR_CODES.budgetCapReached);
    expect(refused.some((entry) => entry.level === 'warn')).toBe(true);
    expect(refused.some((entry) => entry.message.includes('summariser'))).toBe(true);
  });

  it('RF-426 P2-35 keeps the readers spend on the cost report', async () => {
    const { folder } = current();

    expect(await readJson(join(folder, 'cost.json'))).toMatchObject({
      totals: { calls: READER_CALLS, inputTokens: 8900, outputTokens: 920 },
    });
  });
});
