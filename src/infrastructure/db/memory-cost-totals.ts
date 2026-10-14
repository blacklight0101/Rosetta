import type { LedgerEntry } from '../../application/ports/cost-ledger.js';
import type {
  CostTotals,
  LedgerGroup,
  ProjectSummaryGroup,
  SummaryGroup,
} from '../../application/ports/cost-totals.js';

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

/** The summary columns of a group, as one key. */
const summaryKey = (entry: LedgerEntry): string =>
  JSON.stringify([entry.currency, entry.costKnown, entry.priceTableVersion]);

const noCalls = (entry: LedgerEntry): SummaryGroup => ({
  currency: entry.currency,
  costKnown: entry.costKnown,
  priceTableVersion: entry.priceTableVersion,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  costMicros: 0n,
});

function summaryOf(entries: readonly LedgerEntry[]): readonly SummaryGroup[] {
  const groups = new Map<string, SummaryGroup>();
  for (const entry of entries) {
    const known = groups.get(summaryKey(entry)) ?? noCalls(entry);
    groups.set(summaryKey(entry), {
      ...known,
      calls: known.calls + 1,
      inputTokens: known.inputTokens + entry.inputTokens,
      outputTokens: known.outputTokens + entry.outputTokens,
      cachedInputTokens: known.cachedInputTokens + entry.cachedInputTokens,
      costMicros: known.costMicros + entry.costMicros,
    });
  }
  return [...groups.values()];
}

export class MemoryCostTotals implements CostTotals {
  private readonly entries: LedgerEntry[] = [];

  add(entry: LedgerEntry): void {
    this.entries.push(entry);
  }

  userSummary(userId: string): Promise<readonly SummaryGroup[]> {
    const mine = this.entries.filter((entry) => entry.userId === userId);
    return Promise.resolve(summaryOf(mine));
  }

  // RF-1008
  projectSummaries(
    userId: string,
    projectIds: readonly string[],
  ): Promise<readonly ProjectSummaryGroup[]> {
    const groups: ProjectSummaryGroup[] = [];
    for (const projectId of projectIds) {
      const mine = this.entries.filter(
        (entry) => entry.userId === userId && entry.projectId === projectId,
      );
      groups.push(...summaryOf(mine).map((group) => ({ ...group, projectId })));
    }
    return Promise.resolve(groups);
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
