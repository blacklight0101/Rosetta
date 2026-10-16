import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { fixtureNow } from '../../../support/account-fixtures.js';
import { answerStore } from '../../../support/observability-store.js';
import { briefServices } from '../../../support/planning-brief-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { amy, bob, projectHarness } from '../../../support/project-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-605, DEC-80, RF-1105: Get and Save planning brief. The first save stores the answers with the
// default of every question left out; a brief changed after a package exists is out of date.

async function setup() {
  const { projects, clock } = projectHarness();
  const project = sampleProject({ userId: amy.userId });
  await projects.insertOrFind(project);
  const runs = new MemoryRunIndex();
  const stores = answerStore(new SecretMasker());
  const services = briefServices({ projects, runs, briefs: stores.briefs, clock });
  return { ...services, ...stores, clock, runs, projectId: project.id };
}

async function addPackage(
  test: Awaited<ReturnType<typeof setup>>,
  startedAt: number,
): Promise<void> {
  await test.runs.insert(
    sampleRun({
      userId: amy.userId,
      projectId: test.projectId,
      stage: 'plan',
      queueState: 'Ended',
      endState: 'Completed',
      startedAt,
    }),
  );
}

describe('GetPlanningBrief', () => {
  it('RF-605 a project with no saved brief shows the default of every question', async () => {
    const test = await setup();

    const outcome = await test.getPlanningBrief.execute({ actor: amy, projectId: test.projectId });

    expect(outcome).toMatchObject({
      ok: true,
      value: { saved: false, outOfDate: false, brief: { migration: 'strangler-fig' } },
    });
    if (!outcome.ok) return;
    expect('savedAt' in outcome.value.brief).toBe(false);
    expect(outcome.value.brief.principles).toContain('tdd');
    expect(outcome.value.brief.defaulted).toContain('principles');
    expect(test.briefFiles.files.size).toBe(0);
  });

  it('RF-1105 another user and an unknown project get the same answer', async () => {
    const test = await setup();

    const other = await test.getPlanningBrief.execute({ actor: bob, projectId: test.projectId });
    const unknown = await test.getPlanningBrief.execute({
      actor: amy,
      projectId: '00000000-0000-4000-a000-0000000000ff',
    });

    expect(other).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual(other);
  });
});

describe('SavePlanningBrief: first save', () => {
  it('RF-605 saves the answers with the default of every question left out, and lists those', async () => {
    const test = await setup();

    const outcome = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'parallel-change' },
    });

    expect(outcome).toMatchObject({
      ok: true,
      value: {
        saved: true,
        outOfDate: false,
        brief: { migration: 'parallel-change', savedAt: test.clock.now().toISOString() },
      },
    });
    if (!outcome.ok) return;
    expect(outcome.value.brief.defaulted).not.toContain('migration');
    expect(outcome.value.brief.defaulted).toContain('principles');
    expect(outcome.value.brief.defaulted).toContain('context.deadline');
    const again = await test.getPlanningBrief.execute({ actor: amy, projectId: test.projectId });
    expect(again).toEqual(outcome);
  });

  it('RF-605 the saved principles default to the catalogue entries switched on', async () => {
    const test = await setup();

    const outcome = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: {},
    });

    expect(outcome.ok && outcome.value.brief.principles).toEqual(
      expect.arrayContaining(['solid', 'kiss', 'dry', 'yagni', 'tdd', 'sdd', 'adrs']),
    );
    expect(outcome.ok && outcome.value.brief.principles).not.toContain('mikado');
  });
});

describe('SavePlanningBrief: refusals', () => {
  it('RF-605 an unknown principle is refused with its field and nothing is written', async () => {
    const test = await setup();

    const outcome = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { principles: ['nonsense'] },
    });

    expect(outcome).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.requestInvalid,
        problems: [
          {
            field: 'principles.0',
            code: ERROR_CODES.requestInvalid,
            reason: 'nonsense is not a principle.',
          },
        ],
      },
    });
    expect(test.briefFiles.files.size).toBe(0);
  });

  it("RF-1105 another user's project is not found and nothing is written", async () => {
    const test = await setup();

    const outcome = await test.savePlanningBrief.execute({
      actor: bob,
      projectId: test.projectId,
      answers: {},
    });

    expect(outcome).toEqual({ ok: false, error: { code: ERROR_CODES.notFound } });
    expect(test.briefFiles.files.size).toBe(0);
  });
});

describe('SavePlanningBrief: second save', () => {
  it('RF-605 saving the same answers again keeps the file and its save instant', async () => {
    const test = await setup();
    const first = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'rewrite' },
    });
    test.clock.advance(60_000);

    const second = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'rewrite' },
    });

    expect(second).toEqual(first);
    expect(test.briefFiles.writes).toHaveLength(1);
  });

  it('RF-605 saving changed answers replaces the brief with a new save instant', async () => {
    const test = await setup();
    await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'rewrite' },
    });
    test.clock.advance(60_000);

    const changed = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'strangler-fig' },
    });

    expect(changed.ok && changed.value.brief).toMatchObject({
      migration: 'strangler-fig',
      savedAt: test.clock.now().toISOString(),
    });
    expect(test.briefFiles.writes).toHaveLength(2);
  });
});

describe('out of date', () => {
  it('RF-605 changing an answer after a package exists makes the brief out of date', async () => {
    const test = await setup();
    await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'rewrite' },
    });
    test.clock.advance(60_000);
    await addPackage(test, test.clock.now().getTime());
    const before = await test.getPlanningBrief.execute({ actor: amy, projectId: test.projectId });
    test.clock.advance(60_000);

    const saved = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'parallel-change' },
    });
    const after = await test.getPlanningBrief.execute({ actor: amy, projectId: test.projectId });

    expect(before.ok && before.value.outOfDate).toBe(false);
    expect(saved.ok && saved.value.outOfDate).toBe(true);
    expect(after.ok && after.value.outOfDate).toBe(true);
  });
});

describe('out of date: same answers', () => {
  it('RF-605 saving the same answers after a package exists does not make it out of date', async () => {
    const test = await setup();
    await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'rewrite' },
    });
    test.clock.advance(60_000);
    await addPackage(test, test.clock.now().getTime());
    test.clock.advance(60_000);

    const saved = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: { migration: 'rewrite' },
    });

    expect(saved.ok && saved.value.outOfDate).toBe(false);
  });

  it('RF-605 a package from another project does not make the brief out of date', async () => {
    const test = await setup();
    await test.runs.insert(
      sampleRun({
        userId: amy.userId,
        projectId: '00000000-0000-4000-a000-0000000000ee',
        stage: 'plan',
        queueState: 'Ended',
        endState: 'Completed',
        startedAt: fixtureNow - 1000,
      }),
    );

    const saved = await test.savePlanningBrief.execute({
      actor: amy,
      projectId: test.projectId,
      answers: {},
    });

    expect(saved.ok && saved.value.outOfDate).toBe(false);
  });
});
