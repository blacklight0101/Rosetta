import { expect, it } from 'vitest';
import { StartParallelism } from '../../../../src/application/runs/run-start-parallelism.js';
import type { Project } from '../../../../src/application/projects/project.js';
import type { RunStage } from '../../../../src/domain/runs/run-states.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { sampleProject, templateSettings } from '../../../support/project-fixtures.js';

// RF-1002, RF-301, P8-59: `run.started` of an understand run carries `parallelism`, the number of
// reader tasks and verifier judgements the run runs at once: `agents.parallelism` brought inside
// 1-8 (DEC-117) as `readerParallelism` returns it. The recorded event is the only evidence read.

function projectWith(parallelism: number): Project {
  const settings = structuredClone(templateSettings);
  settings.agents.parallelism = parallelism;
  return sampleProject({ settings });
}

async function startedDataOf(
  project: Project | undefined,
  stage: RunStage = 'understand',
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const parallelism = new StartParallelism({ projects: { find: () => Promise.resolve(project) } });
  const h = createRunHarness({ parallelism });
  const run = await h.start(userAmy, stage);
  h.executor.settle(run.id, { endState: 'Completed' });
  await h.ended(run);
  const [started] = await h.events.read(h.scopeOf(run), 0);
  expect(started?.type).toBe('run.started');
  return started?.data;
}

it('RF-1002 run.started of an understand run carries the parallelism the run uses', async () => {
  expect(await startedDataOf(projectWith(4))).toMatchObject({ parallelism: 4 });
});

it('RF-1002 a parallelism above the range is recorded as 8, the number the run uses', async () => {
  expect(await startedDataOf(projectWith(20))).toMatchObject({ parallelism: 8 });
});

it('RF-1002 a parallelism below the range is recorded as 1, the number the run uses', async () => {
  expect(await startedDataOf(projectWith(0))).toMatchObject({ parallelism: 1 });
});

it('RF-1002 a fractional parallelism is recorded as the whole number the run uses', async () => {
  expect(await startedDataOf(projectWith(3.7))).toMatchObject({ parallelism: 3 });
});

it('RF-1002 run.started of a run whose project cannot be read carries no parallelism', async () => {
  expect(await startedDataOf(undefined)).not.toHaveProperty('parallelism');
});

it('RF-1002 run.started of a scan run carries no parallelism, it runs no reader', async () => {
  expect(await startedDataOf(projectWith(4), 'scan')).not.toHaveProperty('parallelism');
});

it('RF-1002 run.started of a plan run carries no parallelism, it runs no reader', async () => {
  expect(await startedDataOf(projectWith(4), 'plan')).not.toHaveProperty('parallelism');
});
