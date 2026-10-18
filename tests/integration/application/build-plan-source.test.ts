import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { cardSaying, planCards } from '../../support/plan-cards.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';

// RF-614, RF-604, RNF-004, RST-1802: a plan run is written from the source run it was started with,
// not from the newest completed understand run, and its manifest records that run.

const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;

const olderKey = '20261010-090000-understand';
const newerKey = '20261011-090000-understand';

let dataDir: string;
let h: PlanHarness;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-source-'));
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  h = await createPlanHarness(dataDir, recording);
  await h.saveBrief(briefAnswers);
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

/** The text of the first planner request. */
function firstMessage(): string {
  const [request] = h.providers.requests();
  return request?.messages.map((each) => each.content).join('\n') ?? '';
}

describe('BuildPlan: the source run', () => {
  it('RF-614 plans from the run named in the options, not the newest, and records it', async () => {
    const older = await h.understandRun({ cards: planCards(), runKey: olderKey });
    await h.understandRun({
      ...{ cards: [cardSaying('BR-900', 'Archiving moves an order to cold storage.')] },
      runKey: newerKey,
    });

    const run = await h.plan({ sourceRunId: older.id });

    expect(run.endState).toBe('Completed');
    expect(firstMessage()).toContain('Checkout creates an order from the basket.');
    expect(firstMessage()).not.toContain('Archiving moves an order');
    expect((await h.manifestOf(run)).sourceRunId).toBe(olderKey);
  });

  it('RF-614 RF-604 with no run named plans from the newest completed run and records it', async () => {
    await h.understandRun({ cards: planCards(), runKey: olderKey });
    await h.understandRun({
      ...{ cards: [cardSaying('BR-900', 'Archiving moves an order to cold storage.')] },
      runKey: newerKey,
    });

    const run = await h.plan();

    expect(firstMessage()).toContain('Archiving moves an order');
    expect(firstMessage()).not.toContain('Checkout creates an order from the basket.');
    expect((await h.manifestOf(run)).sourceRunId).toBe(newerKey);
  });

  it('RST-1802 a named run that ended CapReached fails the run before any model call', async () => {
    const stopped = await h.understandRun({
      ...{ cards: planCards(), runKey: olderKey, endState: 'CapReached' },
    });
    await h.understandRun({ cards: planCards(), runKey: newerKey });

    const run = await h.plan({ sourceRunId: stopped.id });

    expect(run).toMatchObject({ endState: 'Failed' });
    expect(h.providers.requests()).toHaveLength(0);
    expect((await h.manifestOf(run)).sourceRunId).toBeNull();
  });

  it('RST-1802 a plan run with no source run records none', async () => {
    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect((await h.manifestOf(run)).sourceRunId).toBeNull();
  });
});
