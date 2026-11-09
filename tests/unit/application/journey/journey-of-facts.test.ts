import { describe, expect, it } from 'vitest';
import { journeyOfFacts } from '../../../../src/application/journey/journey-of-facts.js';
import { GetJourney } from '../../../../src/application/use-cases/get-journey.js';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// P8-139, DEC-226, RF-615, RF-010: the journey is read from the stored facts alone: the run rows and
// the project row. Every file port given to it fails the test if called, so the read opens no run
// file. The same function turns the facts of many projects into their journeys.

const account = sampleAccount({ userName: 'stored.facts' });
const actor = actorOf(account);
const hour = 3_600_000;
const day0 = Date.parse('2026-10-12T09:00:00.000Z');

const refuse = (): never => {
  throw new Error('The journey read opened a run file.');
};
/** Every file the journey read used to open, as ports that fail when called. */
const files = {
  manifests: { read: refuse },
  history: { read: refuse, lastSeq: refuse },
  briefs: { read: refuse },
  cards: { cardsOf: refuse },
  answers: { questionsOf: refuse },
  priorCards: { cardsOf: refuse, markAnswered: refuse },
};

async function world(given: { readonly briefSavedAt?: number } = {}) {
  const project = sampleProject({ userId: account.id, ...given });
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const runs = new MemoryRunIndex();
  const add = async (key: string, at: number, extra: Partial<Run>): Promise<Run> => {
    const stage = key.endsWith('plan') ? 'plan' : key.endsWith('scan') ? 'scan' : 'understand';
    const run = sampleRun({
      ...{ userId: account.id, projectId: project.id, runKey: key, stage, queuedAt: at },
      ...{ startedAt: at, queueState: 'Ended', endState: 'Completed', endedAt: at + hour / 2 },
      ...extra,
    });
    await runs.insert(run);
    return run;
  };
  const journey = new GetJourney({ projects, runs, ...files });
  const read = (runId?: string) => journey.execute({ actor, projectId: project.id, runId });
  return { project, runs, add, read };
}

describe('GetJourney from the stored facts', () => {
  it('DEC-226 RF-615 a completed run gives its stored claims and questions without a file', async () => {
    const w = await world();
    const run = await w.add('20261012-090000-understand', day0, {
      ...{ supportedClaims: 4, openQuestions: 2 },
    });

    expect(await w.read()).toMatchObject({
      ok: true,
      value: {
        source: { id: run.id, supportedClaims: 4, openQuestions: 2, errorCode: null },
        ...{ briefSaved: false, plan: null, handoff: null },
      },
    });
  });

  it('DEC-226 RF-646 a Deepen and its family come from the stored parent', async () => {
    const w = await world();
    const first = await w.add('20261012-090000-understand', day0, { openQuestions: 3 });
    const deepen = await w.add('20261012-110000-understand', day0 + 2 * hour, {
      ...{ deepenParentId: first.id, supportedClaims: 5, openQuestions: 3 },
    });
    await w.add('20261012-130000-understand', day0 + 4 * hour, {
      ...{ deepenParentId: deepen.id, queueState: 'Queued', endState: null, endedAt: null },
    });

    expect(await w.read()).toMatchObject({
      ok: true,
      value: {
        source: { id: deepen.id, openQuestions: 3, deepens: 1, isDeepen: true, deepening: true },
      },
    });
  });
});

describe('GetJourney from the stored facts (gaps)', () => {
  it('DEC-226 RF-627 a plan run from its stored source, ended RST-1806, is a package with gaps', async () => {
    const w = await world({ briefSavedAt: day0 + hour });
    const source = await w.add('20261012-090000-understand', day0, { supportedClaims: 4 });
    const plan = await w.add('20261012-120000-plan', day0 + 3 * hour, {
      ...{ endState: 'Failed', endCode: ERROR_CODES.planCoverageGap },
      planSourceKey: source.runKey,
    });

    expect(await w.read(plan.id)).toMatchObject({
      ok: true,
      value: {
        source: { id: source.id },
        briefSaved: true,
        plan: { id: plan.id, errorCode: ERROR_CODES.planCoverageGap },
        handoff: { runId: plan.id, gaps: true, outOfDate: false },
      },
    });
  });
});

describe('GetJourney from the stored facts (package and queue)', () => {
  it('DEC-226 RF-615 a brief saved after the package began puts the package out of date', async () => {
    const w = await world({ briefSavedAt: day0 + 5 * hour });
    const source = await w.add('20261012-090000-understand', day0, { supportedClaims: 4 });
    await w.add('20261012-120000-plan', day0 + 3 * hour, { planSourceKey: source.runKey });

    expect(await w.read()).toMatchObject({ ok: true, value: { handoff: { outOfDate: true } } });
  });

  it('DEC-226 RF-615 a fact nobody stored reads as a missing file did', async () => {
    const w = await world();
    await w.add('20261012-090000-understand', day0, {});
    await w.add('20261012-120000-plan', day0 + 3 * hour, { endState: 'Failed' });

    expect(await w.read()).toMatchObject({
      ok: true,
      value: {
        source: { supportedClaims: 0, openQuestions: 0, deepens: 0, isDeepen: false },
        ...{ briefSaved: false, plan: null, handoff: null },
      },
    });
  });

  it('RF-1108 DEC-226 a queued plan run from its stored source keeps its place in the queue', async () => {
    const w = await world({ briefSavedAt: day0 });
    const source = await w.add('20261012-090000-understand', day0, { supportedClaims: 4 });
    const queued = {
      queueState: 'Queued',
      endState: null,
      endedAt: null,
      startedAt: null,
    } as const;
    await w.add('20261012-120000-plan', day0 + 3 * hour, {
      ...queued,
      planSourceKey: source.runKey,
    });

    expect(await w.read()).toMatchObject({
      ok: true,
      value: { plan: { queueState: 'Queued', position: 1 } },
    });
  });
});

describe('the journey of many projects', () => {
  it('DEC-226 RF-010 the function the journey read uses gives each project the same journey', async () => {
    const one = await world();
    await one.add('20261012-090000-understand', day0, { supportedClaims: 1, openQuestions: 1 });
    const two = await world({ briefSavedAt: day0 });
    await two.add('20261012-090000-understand', day0, { supportedClaims: 2 });

    const journeys = [];
    for (const each of [one, two]) {
      const runs = await each.runs.list(account.id, each.project.id);
      const briefSavedAt = each === two ? day0 : null;
      journeys.push(
        journeyOfFacts({ runs, briefSavedAt, record: undefined, positions: new Map() }),
      );
    }

    expect(journeys).toEqual([await one.read(), await two.read()]);
  });
});
