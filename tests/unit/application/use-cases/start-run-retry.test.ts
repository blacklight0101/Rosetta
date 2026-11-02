import { noJourney } from '../../../support/journey-lookups.js';
import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';
import { describe, expect, it } from 'vitest';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-208, Q-43, RF-1105: "Retry failed areas" starts an understand run linked to the run it retries.
// That run must be the user's, of this project, an understand run that ended Completed, and the
// request names the areas to read again; the manifest records the link. A refusal creates no run.

const fakeReader = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'judge-model' },
});

// P7-38: the roles send code to a cloud provider, so a run without consent is refused (RST-1515).
const cloudReader = settingsFor({
  reader: { provider: 'anthropic', model: 'cloud-model' },
  summariser: { provider: 'anthropic', model: 'cloud-model' },
  verifier: { provider: 'anthropic', model: 'cloud-model' },
});

async function setup(settings = fakeReader) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings });
  const other = sampleProject({ userId: userAmy.userId, settings: fakeReader });
  await projects.insertOrFind(project);
  await projects.insertOrFind(other);
  const startRun = new StartRun({
    journey: noJourney,
    roleKeys: ALL_KEYS_SERVED,
    ...{
      projects,
      runs: harness.runs,
      manifests: harness.manifests,
      briefs: new MemoryBriefStore(),
      submit: harness.submit,
    },
  });
  const seed = async (overrides: Partial<Run>): Promise<Run> => {
    const run = sampleRun({
      ...{ userId: project.userId, projectId: project.id, stage: 'understand' },
      ...{ queueState: 'Ended', endState: 'Completed', ...overrides },
    });
    await harness.runs.insert(run);
    return run;
  };
  const retry = (
    parent: Run,
    areas: readonly string[] | 'none' = ['Catalog'],
    cloudConsent?: boolean,
  ) =>
    startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'understand', retryOf: parent.id },
      ...(areas === 'none' ? {} : { areas }),
      ...(cloudConsent === undefined ? {} : { cloudConsent }),
    });
  return { harness, project, other, seed, retry };
}

describe('StartRun retrying the failed areas', () => {
  it('RF-208 records the run to retry in the manifest options', async () => {
    const { harness, seed, retry } = await setup();
    const parent = await seed({});

    const started = await retry(parent);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options).toEqual({
      ...{ cloudConsent: false, areas: ['Catalog'] },
      retryOf: parent.id,
    });
  });

  it.each(['CapReached', 'Failed', 'Interrupted'] as const)(
    'RF-208 refuses a run that ended %s, creating no run',
    async (endState) => {
      const { harness, project, seed, retry } = await setup();
      const parent = await seed({ endState });
      const before = (await harness.runs.list(userAmy.userId, project.id)).length;

      const started = await retry(parent);

      expect(started).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
      expect(await harness.runs.list(userAmy.userId, project.id)).toHaveLength(before);
    },
  );
});

describe('StartRun refusing a retry', () => {
  it('RF-208 refuses a run that is not an understand run', async () => {
    const { seed, retry } = await setup();
    const scan = await seed({ stage: 'scan' });

    expect(await retry(scan)).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
  });

  it.each([{ areas: 'none' }, { areas: [] }] as const)(
    'RF-208 refuses a retry that names no area (%j)',
    async ({ areas }) => {
      const { harness, project, seed, retry } = await setup();
      const parent = await seed({});
      const before = (await harness.runs.list(userAmy.userId, project.id)).length;

      const started = await retry(parent, areas);

      expect(started).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
      expect(await harness.runs.list(userAmy.userId, project.id)).toHaveLength(before);
    },
  );

  it('RF-1105 answers a run that is not found, another user or another project alike', async () => {
    const { other, seed, retry } = await setup();
    const strangers = await seed({ userId: userBob.userId });
    const elsewhere = await seed({ projectId: other.id });

    expect(await retry(strangers)).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(await retry(elsewhere)).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(await retry({ ...elsewhere, id: 'no-such-run' })).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
  });
});

describe('StartRun inheriting the retry consent (P7-38)', () => {
  it('P7-38 inherits the consent recorded on the retried run, with no RST-1515', async () => {
    const { harness, seed, retry } = await setup(cloudReader);
    const parent = await seed({});
    await harness.manifests.write(
      harness.scopeOf(parent),
      sampleManifest({
        runId: parent.runKey,
        stage: 'understand',
        options: { cloudConsent: true },
      }),
    );

    const started = await retry(parent);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options['cloudConsent']).toBe(true);
  });

  it('P7-38 ignores a cloudConsent false sent by the browser when the run recorded consent', async () => {
    const { harness, seed, retry } = await setup(cloudReader);
    const parent = await seed({});
    await harness.manifests.write(
      harness.scopeOf(parent),
      sampleManifest({
        runId: parent.runKey,
        stage: 'understand',
        options: { cloudConsent: true },
      }),
    );

    const started = await retry(parent, ['Catalog'], false);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options['cloudConsent']).toBe(true);
  });
});

describe('StartRun refusing a retry without consent (P7-38)', () => {
  it('P7-38 refuses a retry of a run with no recorded consent until the box is ticked', async () => {
    const { harness, project, seed, retry } = await setup(cloudReader);
    const parent = await seed({});
    await harness.manifests.write(
      harness.scopeOf(parent),
      sampleManifest({
        runId: parent.runKey,
        stage: 'understand',
        options: { cloudConsent: false },
      }),
    );
    const before = (await harness.runs.list(userAmy.userId, project.id)).length;

    expect(await retry(parent)).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
    expect(await harness.runs.list(userAmy.userId, project.id)).toHaveLength(before);
    expect(await retry(parent, ['Catalog'], true)).toMatchObject({ ok: true });
  });

  it('P7-38 answers a forged retryOf of another user run, even one with consent, 404', async () => {
    const { harness, seed, retry } = await setup(cloudReader);
    const strangers = await seed({ userId: userBob.userId });
    await harness.manifests.write(
      harness.scopeOf(strangers),
      sampleManifest({
        runId: strangers.runKey,
        stage: 'understand',
        options: { cloudConsent: true },
      }),
    );

    expect(await retry(strangers)).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});
