import { describe, expect, it } from 'vitest';
import { ListProjectOverview } from '../../../../src/application/use-cases/list-project-overview.js';
import { MemoryCostTotals } from '../../../../src/infrastructure/db/memory-cost-totals.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { counting, type CallCount } from '../../../support/counting-store.js';
import { seedProjects } from '../../../support/overview-seed.js';

// RF-1008, RF-1108, RF-1105: the Projects overview reads the latest run and the totals of all the
// user's projects in a fixed number of reads, answers at most 100 projects (the newest), and never
// shows another user's.

const amy = { userId: '00000000-0000-4000-9000-0000000000a1', role: 'user' } as const;
const bob = { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' } as const;
/** The documented limit of projects one overview answers. */
const LIMIT = 100;

function setup(): {
  readonly overview: ListProjectOverview;
  readonly stores: Parameters<typeof seedProjects>[0];
  readonly count: CallCount;
} {
  const count: CallCount = { calls: 0 };
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const costs = new MemoryCostTotals();
  return {
    overview: new ListProjectOverview({
      projects: counting(projects, count),
      runs: counting(runs, count),
      costs: counting(costs, count),
    }),
    stores: {
      projects,
      runs,
      addCost: (entry) => {
        costs.add(entry);
        return Promise.resolve();
      },
    },
    count,
  };
}

describe('ListProjectOverview reads', () => {
  it('RF-1008 reads the same number of times for 1, 10 and 50 projects', async () => {
    const counts: number[] = [];
    for (const projects of [1, 10, 50]) {
      const { overview, stores, count } = setup();
      await seedProjects(stores, amy.userId, projects);

      const rows = await overview.execute({ actor: amy });

      expect(rows).toHaveLength(projects);
      counts.push(count.calls);
    }
    expect(new Set(counts).size).toBe(1);
  });
});

describe('ListProjectOverview rows', () => {
  it('RF-1008 gives each project its run count, its totals and its newest run', async () => {
    const { overview, stores } = setup();
    await seedProjects(stores, amy.userId, 3);

    const rows = await overview.execute({ actor: amy });

    expect(rows.map((row) => row.project.name)).toEqual([
      'owner/seed-3',
      'owner/seed-2',
      'owner/seed-1',
    ]);
    for (const row of rows) {
      expect(row.runs).toBe(2);
      expect(row.totals).toMatchObject({ calls: 1, inputTokens: 1000 });
      expect(row.lastRun?.projectId).toBe(row.project.id);
    }
  });
});

describe('ListProjectOverview scope', () => {
  it('RF-1008 answers at most the limit, the newest projects', async () => {
    const { overview, stores } = setup();
    await seedProjects(stores, amy.userId, LIMIT + 5);

    const rows = await overview.execute({ actor: amy });

    expect(rows).toHaveLength(LIMIT);
    expect(rows[0]?.project.name).toBe(`owner/seed-${String(LIMIT + 5)}`);
    expect(rows.at(-1)?.project.name).toBe('owner/seed-6');
  });

  it("RF-1105 never gives another user's project, run or cost", async () => {
    const { overview, stores } = setup();
    await seedProjects(stores, amy.userId, 2);
    await seedProjects(stores, bob.userId, 3);

    const rows = await overview.execute({ actor: amy });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.project.userId === amy.userId)).toBe(true);
    expect(rows.every((row) => row.runs === 2 && row.totals.calls === 1)).toBe(true);
  });
});
