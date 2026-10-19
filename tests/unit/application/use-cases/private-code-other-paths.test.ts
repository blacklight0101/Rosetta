import { heldZip } from '../../../support/upload-run-fixtures.js';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ResumeRun } from '../../../../src/application/use-cases/resume-run.js';
import { StartDeepen } from '../../../../src/application/use-cases/start-deepen.js';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { RunEndState } from '../../../../src/domain/runs/run-states.js';
import type { SourceKind } from '../../../../src/domain/sources/source-kind.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { settledRun } from '../../../support/run-settled.js';

// RF-132, RF-143, DEC-148: the second confirmation on every start path that asks the cloud consent:
// the plan run, Resume and Deepen. An uploaded project is refused with RST-1521 without it and
// accepted with it; a GitHub project is never asked.

const cloudPlanner = settingsFor({ planner: { provider: 'openai', model: 'gpt-5-mini' } });
const cloudReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });
const refused = { ok: false, error: ERROR_CODES.privateCodeNotConfirmed };

async function setup(settings: ProjectSettings, kind: SourceKind) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const owner = { userId: userAmy.userId, settings };
  const project =
    kind === 'upload'
      ? sampleProject({ ...owner, sourceKind: 'upload', sourceUrl: '', upload: heldZip })
      : sampleProject(owner);
  await projects.insertOrFind(project);
  const briefs = new MemoryBriefStore();
  await briefs.saveEmpty({ userId: project.userId, projectId: project.id });
  const { runs, manifests, submit } = harness;
  return {
    ...{ harness, project, briefs, projects },
    startRun: new StartRun({ projects, runs, briefs, submit }),
    deepen: new StartDeepen({ projects, runs, manifests, submit }),
    resume: new ResumeRun({
      ...{ projects, runs, manifests, queue: harness.queue, clock: harness.clock },
      problem: () => Promise.resolve(undefined),
    }),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** An understand run of the project that ended as given, started with the options given. */
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

describe('StartRun for plan and the private code of an upload', () => {
  const plan = (s: Setup) => ({ actor: userAmy, projectId: s.project.id, stage: 'plan' }) as const;

  it('RF-132 refuses a plan run of an upload with a cloud planner without the confirmation', async () => {
    const s = await setup(cloudPlanner, 'upload');

    const started = await s.startRun.execute({ ...plan(s), cloudConsent: true });

    expect(started).toEqual(refused);
    expect(s.harness.executor.started).toHaveLength(0);
  });

  it('RF-132 accepts it with the confirmation', async () => {
    const s = await setup(cloudPlanner, 'upload');

    const started = await s.startRun.execute({
      ...{ ...plan(s), cloudConsent: true },
      privateCodeConfirmed: true,
    });

    expect(started.ok).toBe(true);
  });

  it('RF-132 RF-143 keeps the consent first, and a GitHub project is not asked', async () => {
    const upload = await setup(cloudPlanner, 'upload');
    const github = await setup(cloudPlanner, 'github');

    const noConsent = await upload.startRun.execute(plan(upload));
    const asked = await github.startRun.execute({ ...plan(github), cloudConsent: true });

    expect(noConsent).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
    expect(asked.ok).toBe(true);
  });
});

describe('ResumeRun and the private code of an upload', () => {
  const resumeOf = (runId: string) => ({ actor: userAmy, runId });

  it('RF-132 refuses to resume the run of an upload that was started without the confirmation', async () => {
    const s = await setup(cloudReader, 'upload');
    const run = await ended(s, 'Failed', { cloudConsent: true });

    const resumed = await s.resume.execute(resumeOf(run.id));

    expect(resumed).toEqual(refused);
  });

  it('RF-132 resumes the run of an upload that was started with it', async () => {
    const s = await setup(cloudReader, 'upload');
    const run = await ended(s, 'Failed', { cloudConsent: true, privateCodeConfirmed: true });

    const resumed = await s.resume.execute(resumeOf(run.id));

    expect(resumed.ok).toBe(true);
  });

  it('RF-132 resumes the run of a GitHub project with the consent alone', async () => {
    const s = await setup(cloudReader, 'github');
    const run = await ended(s, 'Failed', { cloudConsent: true });

    const resumed = await s.resume.execute(resumeOf(run.id));

    expect(resumed.ok).toBe(true);
  });
});

describe('StartDeepen and the private code of an upload', () => {
  const request = (runId: string) => ({
    ...{ actor: userAmy, runId },
    ...{ confirmed: true, cloudConsent: true },
  });

  it('RF-132 refuses a Deepen of an upload with a cloud role without the confirmation', async () => {
    const s = await setup(cloudReader, 'upload');
    const run = await ended(s, 'Completed', { cloudConsent: true, privateCodeConfirmed: true });
    const before = s.harness.executor.started.length;

    const started = await s.deepen.execute(request(run.id));

    expect(started).toEqual(refused);
    expect(s.harness.executor.started).toHaveLength(before);
  });

  it('RF-132 accepts it with the confirmation and records it for Resume', async () => {
    const s = await setup(cloudReader, 'upload');
    const run = await ended(s, 'Completed', { cloudConsent: true, privateCodeConfirmed: true });

    const started = await s.deepen.execute({ ...request(run.id), privateCodeConfirmed: true });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await s.harness.manifests.read(s.harness.scopeOf(started.value.run));
    expect(manifest?.options).toMatchObject({ cloudConsent: true, privateCodeConfirmed: true });
  });

  it('RF-132 a Deepen of a GitHub project needs the consent alone and records nothing more', async () => {
    const s = await setup(cloudReader, 'github');
    const run = await ended(s, 'Completed', { cloudConsent: true });

    const started = await s.deepen.execute(request(run.id));

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await s.harness.manifests.read(s.harness.scopeOf(started.value.run));
    expect(manifest?.options).not.toHaveProperty('privateCodeConfirmed');
  });
});
