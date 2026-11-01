import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';
import { heldWorkbooks } from '../../../support/workbook-run-fixtures.js';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { rolesNeedPrivateConfirmation } from '../../../../src/application/understand/understand-options.js';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ResumeRun } from '../../../../src/application/use-cases/resume-run.js';
import { StartDeepen } from '../../../../src/application/use-cases/start-deepen.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { RunEndState } from '../../../../src/domain/runs/run-states.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { settledRun } from '../../../support/run-settled.js';

// RF-132, RF-157, DEC-150: a project of kind `workbook` is private code: the second confirmation is
// asked on every start path that asks the cloud consent, and refused with RST-1521 without it.

const cloudReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });
const cloudPlanner = settingsFor({ planner: { provider: 'openai', model: 'gpt-5-mini' } });
const local = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
});
const refused = { ok: false, error: ERROR_CODES.privateCodeNotConfirmed };

async function setup(settings: ProjectSettings) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({
    userId: userAmy.userId,
    settings,
    sourceKind: 'workbook',
    sourceUrl: '',
    ref: '',
    subpath: '',
    upload: heldWorkbooks,
  });
  await projects.insertOrFind(project);
  const briefs = new MemoryBriefStore();
  await briefs.saveEmpty({ userId: project.userId, projectId: project.id });
  const { runs, manifests, submit } = harness;
  return {
    ...{ harness, project },
    startRun: new StartRun({ roleKeys: ALL_KEYS_SERVED, projects, runs, briefs, submit }),
    deepen: new StartDeepen({ roleKeys: ALL_KEYS_SERVED, projects, runs, manifests, submit }),
    resume: new ResumeRun({
      roleKeys: ALL_KEYS_SERVED,
      ...{ projects, runs, manifests, queue: harness.queue, clock: harness.clock },
      problem: () => Promise.resolve(undefined),
    }),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function ended(s: Setup, endState: RunEndState, options: Record<string, unknown>) {
  const submitted = await s.harness.submit.execute({
    ...{ actor: userAmy, project: s.project, stage: 'understand' },
    options,
  });
  if (!submitted.ok) throw new Error('The run was not accepted');
  await Promise.resolve();
  s.harness.executor.settle(submitted.value.run.id, { endState });
  return settledRun(s.harness, submitted.value.run);
}

describe('rolesNeedPrivateConfirmation', () => {
  it.each([
    ['workbook', true],
    ['upload', true],
    ['github', false],
  ])('RF-157 a %s project with a cloud role needs it: %s', (sourceKind, needed) => {
    expect(rolesNeedPrivateConfirmation({ sourceKind, settings: cloudReader }, undefined)).toBe(
      needed,
    );
  });

  it('RF-157 a workbook project whose roles are all local does not need it', () => {
    expect(
      rolesNeedPrivateConfirmation({ sourceKind: 'workbook', settings: local }, undefined),
    ).toBe(false);
  });
});

describe('StartRun of a workbook project', () => {
  const understand = (s: Setup) =>
    ({ actor: userAmy, projectId: s.project.id, stage: 'understand' }) as const;

  it('RF-157 refuses an understand run with a cloud role and no second confirmation', async () => {
    const s = await setup(cloudReader);

    const started = await s.startRun.execute({ ...understand(s), cloudConsent: true });

    expect(started).toEqual(refused);
    expect(s.harness.executor.started).toHaveLength(0);
    expect(await s.harness.runs.list(userAmy.userId, s.project.id)).toEqual([]);
  });

  it('RF-157 accepts it with both confirmations and records the second in the options', async () => {
    const s = await setup(cloudReader);

    const started = await s.startRun.execute({
      ...understand(s),
      cloudConsent: true,
      privateCodeConfirmed: true,
    });

    expect(started.ok).toBe(true);
    expect(s.harness.executor.started[0]?.manifest.options).toMatchObject({
      cloudConsent: true,
      privateCodeConfirmed: true,
    });
  });
});

describe('StartRun of a workbook project, plan run and local roles', () => {
  const understand = (s: Setup) =>
    ({ actor: userAmy, projectId: s.project.id, stage: 'understand' }) as const;

  it('RF-157 refuses a plan run with a cloud planner and no second confirmation', async () => {
    const s = await setup(cloudPlanner);

    const started = await s.startRun.execute({
      actor: userAmy,
      projectId: s.project.id,
      stage: 'plan',
      cloudConsent: true,
    });

    expect(started).toEqual(refused);
  });

  it('RF-157 asks nothing when every role is local', async () => {
    const s = await setup(local);

    const started = await s.startRun.execute(understand(s));

    expect(started.ok).toBe(true);
  });
});

describe('Resume and Deepen of a workbook project', () => {
  it('RF-157 refuses to resume a run that was started without the second confirmation', async () => {
    const s = await setup(cloudReader);
    const run = await ended(s, 'Failed', { cloudConsent: true });

    const resumed = await s.resume.execute({ actor: userAmy, runId: run.id });

    expect(resumed).toEqual(refused);
  });

  it('RF-157 refuses a Deepen with a cloud role and no second confirmation', async () => {
    const s = await setup(cloudReader);
    const run = await ended(s, 'Completed', { cloudConsent: true, privateCodeConfirmed: true });

    const started = await s.deepen.execute({
      ...{ actor: userAmy, runId: run.id },
      ...{ confirmed: true, cloudConsent: true },
    });

    expect(started).toEqual(refused);
  });
});
