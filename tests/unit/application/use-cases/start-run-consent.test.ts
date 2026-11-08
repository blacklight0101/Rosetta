import { describe, expect, it } from 'vitest';
import { startConsentsOf } from '../../../../src/application/use-cases/consent-use-cases.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import type { Project } from '../../../../src/application/projects/project.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryProjectConsents } from '../../../../src/infrastructure/db/memory-project-consents.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { noJourney } from '../../../support/journey-lookups.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { heldZip } from '../../../support/upload-run-fixtures.js';
import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';

// RF-143, RF-132, RF-142, DEC-209: a start that carries the consent gives one on the project; a
// later start under a consent that holds needs no boxes and records the consent it runs under; a
// provider the consent does not name, 30 days or a withdrawal ask again.

const day = 24 * 60 * 60 * 1000;

const anthropic = settingsFor({
  reader: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
  planner: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
});
const openai = settingsFor({
  reader: { provider: 'openai', model: 'gpt-5-mini' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
});

async function setup(settings: ProjectSettings = anthropic, upload = false) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const owner = { userId: userAmy.userId, settings };
  const project = upload
    ? sampleProject({ ...owner, sourceKind: 'upload', sourceUrl: '', upload: heldZip })
    : sampleProject(owner);
  await projects.insertOrFind(project);
  const briefs = new MemoryBriefStore();
  await briefs.saveEmpty({ userId: project.userId, projectId: project.id });
  const consents = new MemoryProjectConsents(projects);
  const startRun = new StartRun({
    ...{ manifests: new MemoryRunManifestStore(), journey: noJourney, roleKeys: ALL_KEYS_SERVED },
    ...{ projects, runs: harness.runs, briefs, submit: harness.submit },
    consents: startConsentsOf({ consents, clock: harness.clock, ids: new SequenceIdGenerator() }),
  });
  return { harness, projects, project, consents, startRun };
}

const understand = (projectId: string) =>
  ({ actor: userAmy, projectId, stage: 'understand' }) as const;

async function optionsOf(
  harness: ReturnType<typeof createRunHarness>,
  started: Awaited<ReturnType<StartRun['execute']>>,
) {
  if (!started.ok) throw new Error(`The start was refused: ${started.error}`);
  const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
  return manifest?.options ?? {};
}

async function changeSettings(
  projects: MemoryProjectRepository,
  project: Project,
  settings: ProjectSettings,
) {
  const change = { userId: project.userId, projectId: project.id, settings };
  await projects.updateSettings({ ...change, updatedAt: 0, expectedVersion: undefined });
}

describe('StartRun gives a consent on the project (RF-143, DEC-209)', () => {
  it('RF-143 a start with the consent gives one naming the providers and records its id', async () => {
    const { harness, project, consents, startRun } = await setup();

    const started = await startRun.execute({ ...understand(project.id), cloudConsent: true });

    const [given] = await consents.list(userAmy.userId, project.id);
    expect(given).toMatchObject({ providers: ['anthropic'], kinds: ['cloud'], withdrawnAt: null });
    expect(await optionsOf(harness, started)).toMatchObject({
      cloudConsent: true,
      consentId: given?.id,
    });
  });

  it('RF-143 a start without the consent and no consent of the project is refused, giving none', async () => {
    const { project, consents, startRun } = await setup();

    const started = await startRun.execute(understand(project.id));

    expect(started).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
    expect(await consents.list(userAmy.userId, project.id)).toEqual([]);
  });

  it('RF-143 a run whose roles are all local gives no consent', async () => {
    const local = settingsFor({
      reader: { provider: 'fake', model: 'fake-model' },
      verifier: { provider: 'fake', model: 'fake-model' },
      summariser: { provider: 'fake', model: 'fake-model' },
    });
    const { project, consents, startRun } = await setup(local);

    const started = await startRun.execute({ ...understand(project.id), cloudConsent: true });

    expect(started.ok).toBe(true);
    expect(await consents.list(userAmy.userId, project.id)).toEqual([]);
  });
});

describe('StartRun under a consent that holds (RF-143, DEC-209)', () => {
  it('RF-143 a consent within 30 days is not asked again and the run records it', async () => {
    const { harness, project, consents, startRun } = await setup();
    await startRun.execute({ ...understand(project.id), cloudConsent: true });
    harness.clock.advance(29 * day);

    const again = await startRun.execute(understand(project.id));

    const listed = await consents.list(userAmy.userId, project.id);
    expect(listed).toHaveLength(1);
    expect(await optionsOf(harness, again)).toMatchObject({
      cloudConsent: true,
      consentId: listed[0]?.id,
    });
  });

  it('RF-143 a plan run starts under the consent the understand run gave', async () => {
    const { harness, project, consents, startRun } = await setup();
    await startRun.execute({ ...understand(project.id), cloudConsent: true });

    const plan = await startRun.execute({ actor: userAmy, projectId: project.id, stage: 'plan' });

    const [given] = await consents.list(userAmy.userId, project.id);
    expect(await optionsOf(harness, plan)).toMatchObject({
      cloudConsent: true,
      consentId: given?.id,
    });
  });
});

describe('StartRun asks again when the consent no longer holds (RF-143, DEC-209)', () => {
  it("RF-143 changing a role's provider asks again", async () => {
    const { projects, project, startRun } = await setup();
    await startRun.execute({ ...understand(project.id), cloudConsent: true });
    await changeSettings(projects, project, openai);

    const again = await startRun.execute(understand(project.id));

    expect(again).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
  });

  it('RF-143 a consent is asked again once 30 days have passed', async () => {
    const { harness, project, startRun } = await setup();
    await startRun.execute({ ...understand(project.id), cloudConsent: true });
    harness.clock.advance(30 * day);

    const again = await startRun.execute(understand(project.id));

    expect(again).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
  });

  it('RF-143 a withdrawn consent is asked again', async () => {
    const { harness, project, consents, startRun } = await setup();
    await startRun.execute({ ...understand(project.id), cloudConsent: true });
    await consents.withdraw(userAmy.userId, project.id, harness.clock.now().getTime());

    const again = await startRun.execute(understand(project.id));

    expect(again).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
  });

  it('RF-143 a new consent given after a provider change holds for the next start', async () => {
    const { projects, project, consents, startRun } = await setup();
    await startRun.execute({ ...understand(project.id), cloudConsent: true });
    await changeSettings(projects, project, openai);
    await startRun.execute({ ...understand(project.id), cloudConsent: true });

    const again = await startRun.execute(understand(project.id));

    expect(again.ok).toBe(true);
    const listed = await consents.list(userAmy.userId, project.id);
    expect(listed.map((consent) => consent.providers)).toEqual([['openai'], ['anthropic']]);
  });
});

describe('StartRun, an uploaded project and a consent that holds (RF-132, DEC-209)', () => {
  it('RF-132 the private-code confirmation is given with the consent and not asked again', async () => {
    const { harness, project, consents, startRun } = await setup(anthropic, true);
    await startRun.execute({
      ...understand(project.id),
      ...{ cloudConsent: true, privateCodeConfirmed: true },
    });

    const again = await startRun.execute(understand(project.id));

    const [given] = await consents.list(userAmy.userId, project.id);
    expect(given?.kinds).toEqual(['cloud', 'private-code']);
    expect(await optionsOf(harness, again)).toMatchObject({
      ...{ cloudConsent: true, privateCodeConfirmed: true },
      consentId: given?.id,
    });
  });

  it('RF-132 a start with the consent but without the confirmation gives no consent', async () => {
    const { project, consents, startRun } = await setup(anthropic, true);

    const started = await startRun.execute({ ...understand(project.id), cloudConsent: true });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.privateCodeNotConfirmed });
    expect(await consents.list(userAmy.userId, project.id)).toEqual([]);
  });

  it("RF-132 changing a role's provider asks both again", async () => {
    const { projects, project, startRun } = await setup(anthropic, true);
    await startRun.execute({
      ...understand(project.id),
      ...{ cloudConsent: true, privateCodeConfirmed: true },
    });
    await changeSettings(projects, project, openai);

    const cloudOnly = await startRun.execute({ ...understand(project.id), cloudConsent: true });

    expect(cloudOnly).toEqual({ ok: false, error: ERROR_CODES.privateCodeNotConfirmed });
  });
});
