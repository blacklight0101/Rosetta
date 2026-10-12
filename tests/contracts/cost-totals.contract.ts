import { expect, it } from 'vitest';
import type { LedgerEntry } from '../../src/application/ports/cost-ledger.js';
import type { CostTotals, LedgerGroup } from '../../src/application/ports/cost-totals.js';
import { costEntry, costProjectId, costRunB, providerTestEntry } from '../support/cost-fixtures.js';

// Architecture section 7: every CostTotals adapter (PgCostTotals, MemoryCostTotals) passes this
// suite. RF-428, RF-1010: the ledger rows of one user (all of them, or one project's) are summed per
// run, stage, role, provider, model, key source, currency, known cost and price table version.

/** What a suite needs to put rows behind the adapter; each adapter's test provides it. */
interface CostTotalsFixture {
  readonly totals: CostTotals;
  /** Stores an account and answers its id. */
  addUser(): Promise<string>;
  add(entry: LedgerEntry): Promise<void>;
}

const byFirstCall = (left: LedgerGroup, right: LedgerGroup): number =>
  left.firstAt.getTime() - right.firstAt.getTime() ||
  left.model.localeCompare(right.model) ||
  Number(left.costKnown) - Number(right.costKnown);

/** The two calls of the first case, summed: the first call's instant, both calls' tokens and cost. */
const summedGroup: LedgerGroup = {
  runId: costEntry('').runId,
  stage: 'understand',
  role: 'reader',
  provider: 'openai',
  model: 'gpt-5-nano',
  keySource: 'server',
  currency: 'USD',
  costKnown: true,
  priceTableVersion: '2026-10-11',
  calls: 2,
  inputTokens: 2000,
  outputTokens: 200,
  cachedInputTokens: 57,
  costMicros: 9_007_199_254_741_693n,
  firstAt: new Date('2026-10-12T10:00:00.000Z'),
};

type Fresh = () => Promise<CostTotalsFixture>;

export function costTotalsContract(name: string, fresh: Fresh): void {
  groupingCases(name, fresh);
  scopeCases(name, fresh);
}

function groupingCases(name: string, fresh: Fresh): void {
  it(`RF-428 ${name} sums the rows of one group and keeps the first call's instant`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    await fixture.add(costEntry(amy, { at: new Date('2026-10-12T10:05:00.000Z') }));
    await fixture.add(costEntry(amy, { costMicros: 9_007_199_254_740_993n, cachedInputTokens: 7 }));

    const groups = await fixture.totals.projectGroups(amy, costProjectId);

    expect(groups).toEqual([summedGroup]);
  });

  it(`RF-428 ${name} keeps apart rows that differ in a breakdown column`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    await fixture.add(costEntry(amy));
    await fixture.add(
      costEntry(amy, { runId: costRunB, at: new Date('2026-10-12T11:00:00.000Z') }),
    );
    const local = { provider: 'ollama', model: 'gemma4:e4b', keySource: 'none' } as const;
    await fixture.add(
      costEntry(amy, { ...local, costMicros: 0n, priceTableVersion: '2026-10-12' }),
    );
    await fixture.add(costEntry(amy, { costKnown: false, costMicros: 0n }));

    const groups = await fixture.totals.projectGroups(amy, costProjectId);

    expect(groups).toHaveLength(4);
    const sorted = groups.toSorted(byFirstCall);
    expect(sorted.map((group) => [group.model, group.costKnown, group.runId])).toEqual([
      ['gemma4:e4b', true, costEntry(amy).runId],
      ['gpt-5-nano', false, costEntry(amy).runId],
      ['gpt-5-nano', true, costEntry(amy).runId],
      ['gpt-5-nano', true, costRunB],
    ]);
    expect(sorted[0]).toMatchObject({ keySource: 'none', priceTableVersion: '2026-10-12' });
  });
}

function scopeCases(name: string, fresh: Fresh): void {
  it(`RF-1010 ${name} scopes the sums to the user, and to the project when one is named`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    const bob = await fixture.addUser();
    await fixture.add(costEntry(amy));
    await fixture.add(costEntry(amy, { projectId: '00000000-0000-4000-8000-0000000000c2' }));
    await fixture.add(costEntry(bob, { costMicros: 5n }));

    const project = await fixture.totals.projectGroups(amy, costProjectId);
    const mine = await fixture.totals.userGroups(amy);
    const theirs = await fixture.totals.userGroups(bob);

    expect(project.map((group) => group.calls)).toEqual([1]);
    expect(mine.map((group) => group.calls)).toEqual([2]);
    expect(theirs.map((group) => group.costMicros)).toEqual([5n]);
  });

  it(`RF-1010 ${name} lists a provider test as a group of no run, never dropped`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    await fixture.add(providerTestEntry(amy, { costMicros: 3n }));

    const mine = await fixture.totals.userGroups(amy);

    expect(mine).toEqual([
      expect.objectContaining({ runId: null, stage: 'provider-test', calls: 1, costMicros: 3n }),
    ]);
    expect(await fixture.totals.projectGroups(amy, costProjectId)).toEqual([]);
  });
}
