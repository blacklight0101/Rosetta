import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import {
  createPlanHarness,
  type PlanHarness,
  type PlanHarnessOptions,
} from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-143, ADR-006, RF-1108: a plan run sends the cards, the brief and the owner's answers only to
// a provider the run may use: a planner that would send them off this machine needs the run's
// consent, and a stopped run ends Interrupted with no package and its cost report written.

const temp = useTempRoot('rosetta-plan-guards-');

async function seededHarness(options: PlanHarnessOptions = {}): Promise<PlanHarness> {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const h = await createPlanHarness(temp.path, recording, options);
  const run = await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.answer(run, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief({ migration: 'parallel-change' });
  return h;
}

describe('BuildPlan: cloud consent', () => {
  it('RF-143 a cloud planner without the run consent ends Failed with RST-1515, sending nothing', async () => {
    const h = await seededHarness({ cloudPlanner: true });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.requests()).toEqual([]);
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({ code: ERROR_CODES.cloudConsentMissing }),
    );
    expect(await h.handoffOf(run)).toEqual({});
  });

  it('RF-143 the same cloud planner with the run consent is called and writes the package', async () => {
    const h = await seededHarness({ cloudPlanner: true });

    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('Completed');
    expect(h.providers.requests()).toHaveLength(3);
    expect(Object.keys(await h.handoffOf(run))).toContain('README.md');
  });
});

describe('BuildPlan: a stopped run', () => {
  it('RF-1108 a run stopped during the planner call ends Interrupted with no package', async () => {
    const h = await seededHarness({ beforeCall: (harness) => harness.stopRunning() });

    const run = await h.plan();

    expect(run.endState).toBe('Interrupted');
    expect(await h.handoffOf(run)).toEqual({});
    const report: unknown = JSON.parse(await readFile(join(h.runFolder(run), 'cost.json'), 'utf8'));
    expect(report).toMatchObject({ runId: run.runKey });
  });
});
