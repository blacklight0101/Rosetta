import { describe, expect, it } from 'vitest';
import type { CapsView } from '../../../../src/application/use-cases/get-caps.js';
import { GetAccountTotals } from '../../../../src/application/use-cases/get-account-totals.js';
import { GetProjectCost } from '../../../../src/application/use-cases/get-project-cost.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryCostTotals } from '../../../../src/infrastructure/db/memory-cost-totals.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { costEntry, providerTestEntry } from '../../../support/cost-fixtures.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// RF-428, RF-1010, RF-1106, RF-1105, P1-36: the cost page of a project and the totals pill.

const amy: Actor = { userId: '00000000-0000-4000-9000-0000000000a1', role: 'user' };
const bob: Actor = { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' };
const root: Actor = { userId: '00000000-0000-4000-9000-0000000000c3', role: 'admin' };

const capsView: CapsView = {
  caps: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  serverMonthToDate: [{ currency: 'USD', costMicros: 8_500_000n }],
};

async function fixture() {
  const projects = new MemoryProjectRepository();
  const costs = new MemoryCostTotals();
  const project = sampleProject({ userId: amy.userId });
  await projects.insertOrFind(project);
  costs.add(costEntry(amy.userId, { projectId: project.id }));
  costs.add(costEntry(amy.userId, { projectId: project.id, keySource: 'none', costMicros: 0n }));
  costs.add(costEntry(amy.userId, { projectId: 'another-project', costMicros: 20n }));
  costs.add(providerTestEntry(amy.userId, { costMicros: 3n }));
  costs.add(costEntry(bob.userId, { projectId: project.id, costMicros: 900n }));
  return {
    project,
    getProjectCost: new GetProjectCost({ projects, costs }),
    getAccountTotals: new GetAccountTotals({
      costs,
      caps: { execute: () => Promise.resolve(capsView) },
    }),
  };
}

describe('GetProjectCost', () => {
  it('RF-428 answers the owner the project totals and the breakdown from the ledger', async () => {
    const { project, getProjectCost } = await fixture();

    const outcome = await getProjectCost.execute({ actor: amy, projectId: project.id });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.project.id).toBe(project.id);
    expect(outcome.value.breakdown.totals).toMatchObject({ calls: 2, inputTokens: 2000 });
    expect(outcome.value.breakdown.totals.cost).toEqual([{ currency: 'USD', costMicros: 700n }]);
    expect(outcome.value.breakdown.byProvider.map((line) => line.key)).toEqual(['openai']);
  });

  it('RF-428 lists the user provider tests beside the breakdown, outside the project totals', async () => {
    const { project, getProjectCost } = await fixture();

    const outcome = await getProjectCost.execute({ actor: amy, projectId: project.id });

    if (!outcome.ok) throw new Error('The cost page was refused.');
    expect(outcome.value.providerTests).toMatchObject({ key: 'provider-tests', local: false });
    expect(outcome.value.providerTests?.totals.cost).toEqual([{ currency: 'USD', costMicros: 3n }]);
    expect(outcome.value.breakdown.byRun.map((line) => line.runId)).not.toContain(null);
  });

  it('RF-1105 answers another user the same not-found as an unknown project', async () => {
    const { project, getProjectCost } = await fixture();

    const other = await getProjectCost.execute({ actor: bob, projectId: project.id });
    const unknown = await getProjectCost.execute({ actor: amy, projectId: 'no-such-project' });

    expect(other).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});

describe('GetAccountTotals', () => {
  it('RF-1010 the pill reads the bounded summary, never one group per run', async () => {
    const costs = new MemoryCostTotals();
    costs.add(costEntry(amy.userId));
    const summaryOnly = {
      userSummary: (userId: string) => costs.userSummary(userId),
      projectGroups: () => Promise.reject(new Error('Not the pill.')),
      providerTestGroups: () => Promise.reject(new Error('Not the pill.')),
    };
    const totals = new GetAccountTotals({
      costs: summaryOnly,
      caps: { execute: () => Promise.resolve(capsView) },
    });

    const answer = await totals.execute({ actor: amy });

    expect(answer.totals).toMatchObject({ calls: 1, inputTokens: 1000, cachedInputTokens: 50 });
    expect(answer.totals.cost).toEqual([{ currency: 'USD', costMicros: 700n }]);
  });

  it('RF-1010 totals cover only my own rows, every project and my provider tests', async () => {
    const { getAccountTotals } = await fixture();

    const answer = await getAccountTotals.execute({ actor: amy });

    expect(answer.totals).toMatchObject({ calls: 4, inputTokens: 4000 });
    expect(answer.totals.cost).toEqual([{ currency: 'USD', costMicros: 723n }]);
    expect(answer.server).toBeUndefined();
  });

  it('RF-1010 RF-1106 the administrator also gets the server month against the cap', async () => {
    const { getAccountTotals } = await fixture();

    const answer = await getAccountTotals.execute({ actor: root });

    expect(answer.totals.calls).toBe(0);
    expect(answer.server).toEqual(capsView);
  });
});
