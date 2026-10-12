import { byCodeUnit } from '../../domain/code-map/code-unit-order.js';
import type { LedgerEntry } from '../ports/cost-ledger.js';

// RF-426, RF-428, data-model.md section 3.12: the cost report of a run, built from its ledger rows
// when it ends: tokens, calls and cost by role, agent task, provider and model, the totals, and the
// price table version (every version the calls used, in order, when a project override priced some
// of them). Lines are sorted by their key in code-unit order so the file is stable.

interface CostFigures {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly calls: number;
  readonly costMicros: number;
}

interface CostTotals extends CostFigures {
  /** Calls of a model without a price (RF-427): their cost is unknown and counted as 0. */
  readonly unpricedCalls: number;
}

export interface CostReport {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly currency: string;
  readonly priceTableVersion: string;
  readonly totals: CostTotals;
  readonly byRole: readonly (CostFigures & { readonly role: string })[];
  readonly byAgentTask: readonly (CostFigures & { readonly agentTaskId: string })[];
  readonly byProvider: readonly (CostFigures & { readonly provider: string })[];
  readonly byModel: readonly (CostFigures & {
    readonly provider: string;
    readonly model: string;
  })[];
}

const none: CostFigures = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  calls: 0,
  costMicros: 0,
};

function add(figures: CostFigures, entry: LedgerEntry): CostFigures {
  return {
    inputTokens: figures.inputTokens + entry.inputTokens,
    outputTokens: figures.outputTokens + entry.outputTokens,
    cachedInputTokens: figures.cachedInputTokens + entry.cachedInputTokens,
    calls: figures.calls + 1,
    costMicros: figures.costMicros + Number(entry.costMicros),
  };
}

/** The figures per key, keys in code-unit order. */
function grouped(
  entries: readonly LedgerEntry[],
  keyOf: (entry: LedgerEntry) => string,
): readonly [string, CostFigures][] {
  const groups = new Map<string, CostFigures>();
  for (const entry of entries) {
    const key = keyOf(entry);
    groups.set(key, add(groups.get(key) ?? none, entry));
  }
  return [...groups].sort(([a], [b]) => byCodeUnit(a, b));
}

const modelKey = (entry: LedgerEntry): string => `${entry.provider}\n${entry.model}`;

function byModel(entries: readonly LedgerEntry[]): CostReport['byModel'] {
  return grouped(entries, modelKey).map(([key, figures]) => {
    const [provider = '', model = ''] = key.split('\n');
    return { provider, model, ...figures };
  });
}

// RF-426
export function buildCostReport(runId: string, entries: readonly LedgerEntry[]): CostReport {
  const versions = [...new Set(entries.map((entry) => entry.priceTableVersion))].sort(byCodeUnit);
  const totals = entries.reduce(add, none);
  return {
    schemaVersion: 1,
    runId,
    currency: entries[0]?.currency ?? 'USD',
    priceTableVersion: versions.join(', '),
    totals: { ...totals, unpricedCalls: entries.filter((entry) => !entry.costKnown).length },
    byRole: grouped(entries, (entry) => entry.role).map(([role, f]) => ({ role, ...f })),
    byAgentTask: grouped(entries, (entry) => entry.agentTaskId ?? '').map(([agentTaskId, f]) => ({
      agentTaskId,
      ...f,
    })),
    byProvider: grouped(entries, (entry) => entry.provider).map(([provider, f]) => ({
      provider,
      ...f,
    })),
    byModel: byModel(entries),
  };
}
