import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards } from '../../support/plan-cards.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';

// RF-604, RF-614, RST-1802, P3-121: a plan run may be written from an understand run that ended
// CapReached when it holds a Supported claim; a run that failed, was interrupted or holds no
// Supported claim is still refused.

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
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-capped-source-'));
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  h = await createPlanHarness(dataDir, recording);
  await h.saveBrief(briefAnswers);
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: a source run that stopped at a cap', () => {
  it('RF-604 RF-614 P3-121 a named run that ended CapReached with Supported claims is planned from, and checks.md says it stopped at a cap', async () => {
    const stopped = await h.understandRun({
      ...{ cards: planCards(), runKey: olderKey, endState: 'CapReached' },
    });
    await h.understandRun({ cards: planCards(), runKey: newerKey });

    const run = await h.plan({ sourceRunId: stopped.id });

    expect(run.endState).toBe('Completed');
    expect((await h.manifestOf(run)).sourceRunId).toBe(olderKey);
    const files = await h.handoffOf(run);
    expect(files['checks.md']).toContain('Source run stopped at a cap');
    expect(files['checks.md']).toMatch(/claims? (was|were) never judged/u);
    expect(files['README.md']).toContain('stopped at a cap');
  });

  it('RF-614 P3-121 a package from a completed run says nothing about a cap', async () => {
    await h.understandRun({ cards: planCards(), runKey: olderKey });

    const run = await h.plan();

    const files = await h.handoffOf(run);
    expect(files['checks.md']).not.toContain('stopped at a cap');
    expect(files['README.md']).not.toContain('stopped at a cap');
  });

  it('RF-614 P3-121 with no run named the newest completed run is the source, a capped one only when there is none', async () => {
    await h.understandRun({ cards: planCards(), runKey: olderKey });
    await h.understandRun({
      ...{ cards: planCards(), runKey: newerKey, endState: 'CapReached' },
    });

    const first = await h.plan();

    expect((await h.manifestOf(first)).sourceRunId).toBe(olderKey);
  });

  it('RF-614 P3-121 with no run named and no completed run the newest capped run is the source', async () => {
    await h.understandRun({
      ...{ cards: planCards(), runKey: olderKey, endState: 'CapReached' },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect((await h.manifestOf(run)).sourceRunId).toBe(olderKey);
  });
});

describe('BuildPlan: a source run that stopped and cannot be planned from', () => {
  it('RST-1802 a named run that ended Failed or Interrupted fails the run before any model call', async () => {
    for (const endState of ['Failed', 'Interrupted'] as const) {
      const stopped = await h.understandRun({
        ...{
          cards: planCards(),
          runKey: `2026101${endState === 'Failed' ? '0' : '1'}-090000-understand`,
          endState,
        },
      });

      const run = await h.plan({ sourceRunId: stopped.id });

      expect(run).toMatchObject({ endState: 'Failed' });
      expect(h.providers.requests()).toHaveLength(0);
      expect((await h.manifestOf(run)).sourceRunId).toBeNull();
    }
  });

  it('RST-1802 a run that ended CapReached with no Supported claim is still refused', async () => {
    await h.understandRun({
      ...{ cards: [], runKey: olderKey, endState: 'CapReached' },
    });

    const run = await h.plan();

    expect(run).toMatchObject({ endState: 'Failed' });
    expect(h.providers.requests()).toHaveLength(0);
  });
});
