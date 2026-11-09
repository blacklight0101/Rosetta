import { describe, expect, it } from 'vitest';
import { GetJourney } from '../../../../src/application/use-cases/get-journey.js';
import { ListProjectOverview } from '../../../../src/application/use-cases/list-project-overview.js';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryCostTotals } from '../../../../src/infrastructure/db/memory-cost-totals.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { counting, type CallCount } from '../../../support/counting-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-010, RF-615, P8-137, DEC-226, P1-137: the Projects overview carries each project's journey, made
// from the stored facts by the function the journey read uses, so the list and the strip of a project
// cannot say different things; the runs of every listed project are read at once.

const account = sampleAccount({ userName: 'overview.journey' });
const actor = actorOf(account);
const hour = 3_600_000;
const day0 = Date.parse('2026-10-12T09:00:00.000Z');

function world() {
  const count: CallCount = { calls: 0 };
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const costs = new MemoryCostTotals();
  const overview = new ListProjectOverview({
    projects: counting(projects, count),
    runs: counting(runs, count),
    costs: counting(costs, count),
  });
  const journey = new GetJourney({ projects, runs });
  const project = async (name: string, briefSavedAt?: number) => {
    const brief = briefSavedAt === undefined ? {} : { briefSavedAt };
    const stored = await projects.insertOrFind(
      sampleProject({ userId: account.id, name, createdAt: day0, ...brief }),
    );
    return stored.project.id;
  };
  const add = async (projectId: string, key: string, at: number, extra: Partial<Run> = {}) => {
    const stage = key.endsWith('plan') ? 'plan' : key.endsWith('scan') ? 'scan' : 'understand';
    const run = sampleRun({
      ...{ userId: account.id, projectId, runKey: key, stage, queuedAt: at },
      ...{ startedAt: at, queueState: 'Ended', endState: 'Completed', endedAt: at + hour / 2 },
      ...extra,
    });
    await runs.insert(run);
    return run;
  };
  return { overview, journey, project, add, count };
}

/** Projects at several points of the road, each with the facts that put it there. */
async function road(w: ReturnType<typeof world>): Promise<void> {
  await w.project('owner/no-run');
  const scanned = await w.project('owner/scanned');
  await w.add(scanned, '20261012-080000-scan', day0 - hour);
  const asking = await w.project('owner/asking');
  await w.add(asking, '20261012-080000-scan', day0 - hour);
  const first = await w.add(asking, '20261012-090000-understand', day0, {
    ...{ supportedClaims: 4, openQuestions: 2 },
  });
  // A Deepen of the first run, queued behind another user's run: the strip says "Deepen running".
  await w.add(asking, '20261012-100000-understand', day0 + hour, {
    ...{ queueState: 'Queued', endState: null, startedAt: null, endedAt: null },
    deepenParentId: first.id,
  });
  const packaged = await w.project('owner/packaged', day0 + 3 * hour);
  const source = await w.add(packaged, '20261012-090000-understand', day0, {
    supportedClaims: 3,
    openQuestions: 0,
  });
  await w.add(packaged, '20261012-110000-plan', day0 + 2 * hour, { planSourceKey: source.runKey });
  const failed = await w.project('owner/failed');
  await w.add(failed, '20261012-090000-understand', day0, {
    ...{ endState: 'Failed', endCode: 'RST-1401' },
  });
}

describe('RF-010 the overview carries the journey of each project', () => {
  it('RF-010 each row carries the journey the journey read gives for the same project', async () => {
    const w = world();
    await road(w);

    const { rows } = await w.overview.execute({ actor });

    expect(rows).toHaveLength(5);
    for (const row of rows) {
      const read = await w.journey.execute({ actor, projectId: row.project.id });
      expect(read.ok).toBe(true);
      expect(row.journey).toEqual(read.ok ? read.value : undefined);
    }
  });

  it('RF-615 the overview journey knows what the last run cannot tell', async () => {
    const w = world();
    await road(w);

    const { rows } = await w.overview.execute({ actor });
    const of = (name: string) => rows.find((row) => row.project.name === name)?.journey;

    expect(of('owner/no-run')).toMatchObject({ source: null, scanRunId: null, plan: null });
    expect(of('owner/scanned')?.source).toBeNull();
    expect(of('owner/asking')?.source).toMatchObject({ openQuestions: 2, deepening: true });
    expect(of('owner/packaged')).toMatchObject({ briefSaved: true, handoff: { outOfDate: true } });
    expect(of('owner/failed')?.source).toMatchObject({ endState: 'Failed', errorCode: 'RST-1401' });
  });
});

describe('P1-137 the journeys of the overview in a fixed number of reads', () => {
  it('P1-137 the overview reads as often for 1, 10 and 50 projects with journeys', async () => {
    const counts: number[] = [];
    for (const size of [1, 10, 50]) {
      const w = world();
      for (let number = 1; number <= size; number += 1) {
        const id = await w.project(`owner/p-${String(number)}`, day0);
        const run = await w.add(id, '20261012-090000-understand', day0, { supportedClaims: 1 });
        await w.add(id, '20261012-110000-plan', day0 + hour, { planSourceKey: run.runKey });
      }
      w.count.calls = 0;

      const { rows } = await w.overview.execute({ actor });

      expect(rows.every((row) => row.journey?.handoff?.outOfDate === false)).toBe(true);
      counts.push(w.count.calls);
    }
    expect(new Set(counts).size).toBe(1);
  });
});
