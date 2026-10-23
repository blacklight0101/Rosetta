import { describe, expect, it } from 'vitest';
import { GetPlanSource } from '../../../../src/application/use-cases/get-plan-source.js';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FileRunCards } from '../../../../src/infrastructure/cards/file-run-cards.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { FilePlanningBriefStore } from '../../../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { cardSaying, planCards } from '../../../support/plan-cards.js';
import { seedPlanSource } from '../../../support/plan-source-seed.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-614, RF-605, RST-1802, RF-1105: Plan setup names the understand run it plans from: which run,
// when it ended, the areas of its cards and how many Supported claims it holds, and whether it is
// the newest completed one (the project path, Q-D).

const account = sampleAccount({ userName: 'plan.source' });
const actor = actorOf(account);

async function setup() {
  const project = sampleProject({ userId: account.id });
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const [runs, files] = [new MemoryRunIndex(), new MemoryOutputWriter()];
  const briefs = new FilePlanningBriefStore({ writer: files, masker: new SecretMasker() });
  const stores = { files, briefs, runs };
  const seed = (overrides: Parameters<typeof seedPlanSource>[2] = {}) =>
    seedPlanSource(stores, project, { brief: false, ...overrides });
  const source = new GetPlanSource({ projects, runs, cards: new FileRunCards(files) });
  return { project, runs, seed, source };
}

describe('GetPlanSource: the run it names', () => {
  it('RF-614 names the chosen run with its date, areas and Supported claims', async () => {
    const { project, seed, source } = await setup();
    const older = await seed({
      ...{
        cards: planCards(),
        run: { runKey: '20261010-090000-understand', endedAt: 1_760_000_000_000 },
      },
    });
    await seed({ cards: [cardSaying('BR-900', 'Archiving moves an order.')] });

    const result = await source.execute({
      ...{ actor, projectId: project.id, runId: older?.id ?? '' },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        runId: older?.id,
        runKey: '20261010-090000-understand',
        endedAt: 1_760_000_000_000,
        areas: ['orders'],
        supportedClaims: 4,
        endState: 'Completed',
        newest: false,
      },
    });
  });

  it('RF-614 the project path names the newest completed understand run', async () => {
    const { project, seed, source } = await setup();
    await seed({ cards: planCards(), run: { runKey: '20261010-090000-understand' } });
    const newer = await seed({ cards: [cardSaying('BR-900', 'Archiving moves an order.')] });

    const result = await source.execute({ actor, projectId: project.id });

    expect(result).toMatchObject({
      ok: true,
      value: { runId: newer?.id, supportedClaims: 1, newest: true },
    });
  });
});

describe('GetPlanSource: a run that cannot be used', () => {
  it('RF-614 the project path skips a newer run that did not complete', async () => {
    const { project, seed, source } = await setup();
    const done = await seed({ cards: planCards(), run: { runKey: '20261010-090000-understand' } });
    await seed({ run: { runKey: '20261012-090000-understand', endState: 'CapReached' } });

    const result = await source.execute({ actor, projectId: project.id });

    expect(result).toMatchObject({ ok: true, value: { runId: done?.id } });
  });

  it('RST-1802 a project with no completed understand run has no source', async () => {
    const { project, source } = await setup();

    expect(await source.execute({ actor, projectId: project.id })).toEqual({
      ok: false,
      error: ERROR_CODES.planSourceMissing,
    });
  });
});

describe('GetPlanSource: a run that stopped at a cap', () => {
  it('RF-614 P3-121 a chosen run that ended CapReached is described with its end state', async () => {
    const { project, seed, source } = await setup();
    const stopped = await seed({ run: { endState: 'CapReached' } });

    const result = await source.execute({
      ...{ actor, projectId: project.id, runId: stopped?.id ?? '' },
    });

    expect(result).toMatchObject({
      ok: true,
      value: { runId: stopped?.id, endState: 'CapReached', supportedClaims: 4, newest: true },
    });
  });

  it('RST-1802 a chosen run that ended Failed is refused', async () => {
    const { project, seed, source } = await setup();
    const stopped = await seed({ run: { endState: 'Failed' } });

    const result = await source.execute({
      ...{ actor, projectId: project.id, runId: stopped?.id ?? '' },
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });

  it('RST-1802 a chosen run with no Supported claim is refused', async () => {
    const { project, seed, source } = await setup();
    const empty = await seed({ cards: [] });

    const result = await source.execute({
      ...{ actor, projectId: project.id, runId: empty?.id ?? '' },
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });
});

describe('GetPlanSource (3)', () => {
  it("RF-1105 an unknown run, another project's run and another user's project are not found", async () => {
    const { project, runs, seed, source } = await setup();
    await seed({});
    const elsewhere = sampleRun({
      ...{ userId: account.id, projectId: '00000000-0000-4000-a000-0000000000ff' },
      ...{ stage: 'understand', queueState: 'Ended', endState: 'Completed' },
    });
    await runs.insert(elsewhere);
    const stranger = { userId: '00000000-0000-4000-9000-0000000000ff', role: 'user' } as const;

    const unknown = await source.execute({ actor, projectId: project.id, runId: sampleRun().id });
    const other = await source.execute({ actor, projectId: project.id, runId: elsewhere.id });
    const theirs = await source.execute({ actor: stranger, projectId: project.id });

    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(other).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(theirs).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});
