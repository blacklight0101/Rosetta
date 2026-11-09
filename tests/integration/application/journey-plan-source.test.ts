import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetJourney } from '../../../src/application/use-cases/get-journey.js';
import { actorOf } from '../../../src/domain/accounts/actor.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { account } from '../../support/plan-run-seeds.js';
import { RecordingFacts } from '../../support/recording-journey-facts.js';

// P8-139, RF-614, RF-615, DEC-226: a plan run queued without a named source learns its source only
// when the planner chooses it (the newest completed understand run). The planner stores it on the
// plan run's row; without it the journey cannot tie the plan to its source.

let dataDir = '';

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-source-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

/** The journey read over the run rows as the stored facts leave them. */
function journeyOf(h: PlanHarness, facts: RecordingFacts) {
  const journey = new GetJourney({
    projects: h.s.projects,
    runs: {
      list: async (userId, projectId) =>
        (await h.s.runs.list(userId, projectId)).map((run: Run) => facts.withPlanSource(run)),
      listQueued: () => h.s.runs.listQueued(),
    },
  });
  return (runId?: string) =>
    journey.execute({ actor: actorOf(account), projectId: h.project.id, runId });
}

describe('the source a planner chooses', () => {
  it('RF-614 RF-615 DEC-226 a plan queued without a named source stores the one the planner chose', async () => {
    const recording = await loadRecording(
      join('tests', 'recordings', 'fake', 'planner-package.json'),
    );
    const facts = new RecordingFacts();
    const h = await createPlanHarness(dataDir, recording, { journeyFacts: facts });
    const source = await h.understandRun({ cards: planCards(), questions: planQuestions });
    await h.saveBrief({});
    await h.seedScan();

    const plan = await h.plan();

    expect(plan.endState).toBe('Completed');
    expect(plan.planSourceKey).toBeUndefined();
    expect(facts.sources).toEqual([[plan.id, source.runKey]]);
    const read = journeyOf(h, facts);
    for (const runId of [undefined, plan.id]) {
      expect(await read(runId)).toMatchObject({
        ok: true,
        value: {
          source: { id: source.id },
          plan: { id: plan.id, endState: 'Completed' },
          handoff: { runId: plan.id, outOfDate: false, gaps: false },
        },
      });
    }
  });
});
