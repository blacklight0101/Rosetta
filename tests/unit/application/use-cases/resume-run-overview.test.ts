import { describe, expect, it } from 'vitest';
import { ResumeRun } from '../../../../src/application/use-cases/resume-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { RunEndState } from '../../../../src/domain/runs/run-states.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { settledRun } from '../../../support/run-settled.js';
import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';

// P7-26, RF-264: Resume can queue the run to write its overview alone; only a capped run can.

async function setup(endState: RunEndState) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({
    userId: userAmy.userId,
    settings: settingsFor({ reader: { provider: 'fake', model: 'fake-model' } }),
  });
  await projects.insertOrFind(project);
  const resume = new ResumeRun({
    ...{ roleKeys: ALL_KEYS_SERVED, projects, runs: harness.runs, manifests: harness.manifests },
    ...{ queue: harness.queue, clock: harness.clock, problem: () => Promise.resolve(undefined) },
  });
  const submitted = await harness.submit.execute({
    ...{ actor: userAmy, project, stage: 'understand' },
    options: { cloudConsent: false },
  });
  if (!submitted.ok) throw new Error('The run was not accepted');
  await Promise.resolve();
  harness.executor.settle(submitted.value.run.id, { endState });
  const run = await settledRun(harness, submitted.value.run);
  return { harness, resume, run };
}

describe('ResumeRun for the overview alone', () => {
  it('P7-26 marks the reopened run to write its overview only, and a plain resume clears it', async () => {
    const { harness, resume, run } = await setup('CapReached');
    const as = { actor: userAmy, runId: run.id };

    await resume.execute({ ...as, overviewOnly: true });
    const marked = await harness.manifests.read(harness.scopeOf(run));
    harness.executor.settle(run.id, { endState: 'CapReached' });
    await settledRun(harness, run);
    await resume.execute(as);
    const cleared = await harness.manifests.read(harness.scopeOf(run));

    expect(marked?.options).toMatchObject({ overviewOnly: true });
    expect(cleared?.options).not.toHaveProperty('overviewOnly');
  });

  it('P7-26 refuses the overview alone for a run that failed', async () => {
    const { resume, run } = await setup('Failed');

    const refused = await resume.execute({ actor: userAmy, runId: run.id, overviewOnly: true });

    expect(refused).toEqual({ ok: false, error: ERROR_CODES.runNotResumable });
  });

  it('P7-26 queues the overview alone for a run that completed', async () => {
    const { resume, run } = await setup('Completed');

    const queued = await resume.execute({ actor: userAmy, runId: run.id, overviewOnly: true });

    expect(queued.ok).toBe(true);
  });
});
