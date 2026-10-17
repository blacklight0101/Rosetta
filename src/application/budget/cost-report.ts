import { byCodeUnit } from '../../domain/code-map/code-unit-order.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { LedgerEntry } from '../ports/cost-ledger.js';

// RF-426, RF-428, data-model.md section 3.12: the cost report of a run, built from its ledger rows
// when it ends: tokens (with the cache writes and their cost, P2-16), calls and cost by role, agent task, provider and model, the totals, and the
// price table version (every version the calls used, in order, when a project override priced some
// of them). Lines are sorted by their key in code-unit order so the file is stable.

interface CostFigures {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  /** Tokens written to the provider's prompt cache, inside the input tokens (P2-16). */
  readonly cacheWriteInputTokens: number;
  readonly calls: number;
  readonly costMicros: number;
  /** The part of the cost the cache writes cost (P2-16). */
  readonly cacheWriteCostMicros: number;
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
  cacheWriteInputTokens: 0,
  calls: 0,
  costMicros: 0,
  cacheWriteCostMicros: 0,
};

function add(figures: CostFigures, entry: LedgerEntry): CostFigures {
  return {
    inputTokens: figures.inputTokens + entry.inputTokens,
    outputTokens: figures.outputTokens + entry.outputTokens,
    cachedInputTokens: figures.cachedInputTokens + entry.cachedInputTokens,
    cacheWriteInputTokens: figures.cacheWriteInputTokens + entry.cacheWriteInputTokens,
    calls: figures.calls + 1,
    costMicros: figures.costMicros + Number(entry.costMicros),
    cacheWriteCostMicros: figures.cacheWriteCostMicros + Number(entry.cacheWriteCostMicros),
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

// RF-426, RF-428: every figure is a JSON number, exact only up to the largest safe integer. Costs
// and tokens are never negative, so a total past that limit stays past it: such a report is refused
// (RST-1605) instead of written with rounded figures. Every line is at most the total, so the total
// alone is checked.
function exactOrRefused(figures: CostFigures): void {
  const values = [
    figures.inputTokens,
    figures.outputTokens,
    figures.cachedInputTokens,
    figures.cacheWriteInputTokens,
    figures.costMicros,
    figures.cacheWriteCostMicros,
  ];
  if (!values.every((value) => Number.isSafeInteger(value))) {
    throw new RosettaError(ERROR_CODES.costTotalOutOfRange);
  }
}

// RF-426
export function buildCostReport(runId: string, entries: readonly LedgerEntry[]): CostReport {
  const versions = [...new Set(entries.map((entry) => entry.priceTableVersion))].sort(byCodeUnit);
  const totals = entries.reduce(add, none);
  exactOrRefused(totals);
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
