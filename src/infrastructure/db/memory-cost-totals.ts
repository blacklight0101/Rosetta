import type { LedgerEntry } from '../../application/ports/cost-ledger.js';
import type { CostTotals, LedgerGroup, SummaryGroup } from '../../application/ports/cost-totals.js';

// Architecture section 7, RF-428, RF-1010: the ledger sums in memory, for unit and route tests. A
// test adds ledger rows; the adapter passes the same contract suite as PgCostTotals.

/** The columns a group shares, as one key. */
function keyOf(entry: LedgerEntry): string {
  return JSON.stringify([
    ...[entry.runId, entry.stage, entry.role, entry.provider, entry.model, entry.keySource],
    ...[entry.currency, entry.costKnown, entry.priceTableVersion],
  ]);
}

function added(group: LedgerGroup | undefined, entry: LedgerEntry): LedgerGroup {
  if (group === undefined) {
    const { runId, stage, role, provider, model, keySource, currency, costKnown } = entry;
    const { priceTableVersion, inputTokens, outputTokens, cachedInputTokens, costMicros } = entry;
    return {
      ...{ runId, stage, role, provider, model, keySource, currency, costKnown, priceTableVersion },
      ...{ calls: 1, inputTokens, outputTokens, cachedInputTokens, costMicros, firstAt: entry.at },
    };
  }
  return {
    ...group,
    calls: group.calls + 1,
    inputTokens: group.inputTokens + entry.inputTokens,
    outputTokens: group.outputTokens + entry.outputTokens,
    cachedInputTokens: group.cachedInputTokens + entry.cachedInputTokens,
    costMicros: group.costMicros + entry.costMicros,
    firstAt: entry.at < group.firstAt ? entry.at : group.firstAt,
  };
}

function groupsOf(entries: readonly LedgerEntry[]): readonly LedgerGroup[] {
  const groups = new Map<string, LedgerGroup>();
  for (const entry of entries) groups.set(keyOf(entry), added(groups.get(keyOf(entry)), entry));
  return [...groups.values()];
}

export class MemoryCostTotals implements CostTotals {
  private readonly entries: LedgerEntry[] = [];

  add(entry: LedgerEntry): void {
    this.entries.push(entry);
  }

  userSummary(_userId: string): Promise<readonly SummaryGroup[]> {
    return Promise.resolve([]);
  }

  userGroups(userId: string): Promise<readonly LedgerGroup[]> {
    return Promise.resolve(groupsOf(this.entries.filter((entry) => entry.userId === userId)));
  }

  projectGroups(userId: string, projectId: string): Promise<readonly LedgerGroup[]> {
    const mine = this.entries.filter(
      (entry) => entry.userId === userId && entry.projectId === projectId,
    );
    return Promise.resolve(groupsOf(mine));
  }

  providerTestGroups(userId: string): Promise<readonly LedgerGroup[]> {
    const mine = this.entries.filter(
      (entry) => entry.userId === userId && entry.projectId === null,
    );
    return Promise.resolve(groupsOf(mine));
  }
}
