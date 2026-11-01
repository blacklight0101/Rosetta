import { journeyOf, serverJourney } from '../../../support/journey-lookups.js';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ResumeRun } from '../../../../src/application/use-cases/resume-run.js';
import { StartDeepen } from '../../../../src/application/use-cases/start-deepen.js';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { RunEndState } from '../../../../src/domain/runs/run-states.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryUserRepository } from '../../../../src/infrastructure/db/memory-user-repository.js';
import { keySourceLookupOf } from '../../../../src/infrastructure/providers/key-source-lookup.js';
import type { ServerKeys } from '../../../../src/infrastructure/providers/provider-access.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { settledRun } from '../../../support/run-settled.js';

// RF-431, DEC-196, EV-44: an understand run, a Deepen and a resume whose roles have no usable key
// (no own key, and no server key the account may use) are refused with RST-2302 before they are
// queued, so no run is recorded and none fails later at $0. A local role needs no key.

const cloudReader = settingsFor({ reader: { provider: 'anthropic', model: 'claude-haiku-4-5' } });
const fakeRoles = settingsFor({ reader: { provider: 'fake', model: 'fake-model' } });
const refused = { ok: false, error: ERROR_CODES.providerKeyMissing };

async function setup(settings: ProjectSettings, serverKeys: ServerKeys = {}) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings });
  await projects.insertOrFind(project);
  const users = new MemoryUserRepository();
  await users.insert(sampleAccount({ id: userAmy.userId, serverKeysAllowed: true }));
  const keys = keySourceLookupOf({ keys: new MemoryProviderKeyRepository(), serverKeys });
  const roleKeys = { users, keys };
  const { runs, manifests, submit } = harness;
  return {
    ...{ harness, project },
    startRun: new StartRun({
      journey: journeyOf(serverJourney),
      projects,
      runs,
      briefs: new MemoryBriefStore(),
      submit,
      roleKeys,
    }),
    deepen: new StartDeepen({ projects, runs, manifests, submit, roleKeys }),
    resume: new ResumeRun({
      ...{ projects, runs, manifests, queue: harness.queue, clock: harness.clock, roleKeys },
      problem: () => Promise.resolve(undefined),
    }),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function ended(s: Setup, endState: RunEndState) {
  const submitted = await s.harness.submit.execute({
    ...{ actor: userAmy, project: s.project, stage: 'understand' },
    options: { cloudConsent: true },
  });
  if (!submitted.ok) throw new Error('The run was not accepted');
  await Promise.resolve();
  s.harness.executor.settle(submitted.value.run.id, { endState });
  return settledRun(s.harness, submitted.value.run);
}

describe('RF-431 no run without a usable key', () => {
  it('RF-431 refuses an understand run with no user key and no server key, and creates no run row', async () => {
    const s = await setup(cloudReader);

    const started = await s.startRun.execute({
      actor: userAmy,
      projectId: s.project.id,
      stage: 'understand',
      cloudConsent: true,
    });

    expect(started).toEqual(refused);
    expect(await s.harness.runs.list(userAmy.userId, s.project.id)).toEqual([]);
    expect(s.harness.executor.started).toHaveLength(0);
  });

  it('RF-431 accepts the run when the server holds a key the account may use', async () => {
    const s = await setup(cloudReader, { anthropic: 'sk-server' });

    const started = await s.startRun.execute({
      actor: userAmy,
      projectId: s.project.id,
      stage: 'understand',
      cloudConsent: true,
    });

    expect(started.ok).toBe(true);
  });

  it('RF-431 a local role needs no key', async () => {
    const s = await setup(fakeRoles);

    const started = await s.startRun.execute({
      actor: userAmy,
      projectId: s.project.id,
      stage: 'understand',
    });

    expect(started.ok).toBe(true);
  });
});

describe('RF-431 no Deepen and no resume without a usable key', () => {
  it('RF-431 refuses a Deepen without a usable key before it is queued', async () => {
    const s = await setup(cloudReader);
    const run = await ended(s, 'Completed');
    const before = s.harness.executor.started.length;

    const started = await s.deepen.execute({
      ...{ actor: userAmy, runId: run.id },
      ...{ confirmed: true, cloudConsent: true },
    });

    expect(started).toEqual(refused);
    expect(await s.harness.runs.list(userAmy.userId, s.project.id)).toHaveLength(1);
    expect(s.harness.executor.started).toHaveLength(before);
  });

  it('RF-431 refuses a resume without a usable key and leaves the run ended', async () => {
    const s = await setup(cloudReader);
    const run = await ended(s, 'CapReached');

    const resumed = await s.resume.execute({ actor: userAmy, runId: run.id });

    expect(resumed).toEqual(refused);
    expect((await s.harness.runs.find(userAmy.userId, run.id))?.endState).toBe('CapReached');
  });
});

describe('RF-430 the approved amount', () => {
  it('RF-430 records the figure the user approved on the start button as the run approved amount', async () => {
    const s = await setup(fakeRoles);

    const started = await s.startRun.execute({
      actor: userAmy,
      projectId: s.project.id,
      stage: 'understand',
      approvedAmount: { tokens: 3_900_000, costMicros: 0 },
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await s.harness.manifests.read(s.harness.scopeOf(started.value.run));
    expect(manifest?.options).toEqual({
      cloudConsent: false,
      approvedAmount: { tokens: 3_900_000, costMicros: 0 },
    });
  });

  it('RF-432 refuses a start whose shown figure is not the server estimate (RST-2310)', async () => {
    const s = await setup(fakeRoles);

    const started = await s.startRun.execute({
      actor: userAmy,
      projectId: s.project.id,
      stage: 'understand',
      approvedAmount: { tokens: 50_000_000, costMicros: 100_000_000 },
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.approvalChanged });
    expect(await s.harness.runs.list(userAmy.userId, s.project.id)).toEqual([]);
  });
});
