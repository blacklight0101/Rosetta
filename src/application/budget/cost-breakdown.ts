import type { CurrencyTotal } from '../ports/account-usage.js';
import type { LedgerGroup } from '../ports/cost-totals.js';

// RF-428, RF-1010, DEC-49: adds ledger groups up into the totals the header shows and the breakdown
// of a project's cost page, by run, stage, role, provider and model.

export interface UsageTotals {
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  /** The known cost per currency, ordered by currency. */
  readonly cost: readonly CurrencyTotal[];
  /** Calls of an unpriced model, whose cost is unknown (RF-427). */
  readonly unknownCostCalls: number;
  /** The price table versions the calls used, in code-unit order. */
  readonly priceTableVersions: readonly string[];
}

export interface BreakdownLine {
  readonly key: string;
  /** True when every call of the line ran on a local model (key source `none`). */
  readonly local: boolean;
  readonly totals: UsageTotals;
}

interface RunLine extends BreakdownLine {
  /** Null for the provider tests, which belong to no run. */
  readonly runId: string | null;
  readonly firstAt: Date;
}

interface ModelLine extends BreakdownLine {
  readonly provider: string;
  readonly model: string;
}

export interface CostBreakdown {
  readonly totals: UsageTotals;
  readonly byRun: readonly RunLine[];
  readonly byStage: readonly BreakdownLine[];
  readonly byRole: readonly BreakdownLine[];
  readonly byProvider: readonly BreakdownLine[];
  readonly byModel: readonly ModelLine[];
}

const codeUnitOrder = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** The key of the line of the provider tests, which belong to no run (RF-407). */
const TESTS_KEY = 'provider-tests';

function costOf(groups: readonly LedgerGroup[]): CurrencyTotal[] {
  const known = new Map<string, bigint>();
  for (const group of groups.filter((each) => each.costKnown)) {
    known.set(group.currency, (known.get(group.currency) ?? 0n) + group.costMicros);
  }
  return [...known]
    .map(([currency, costMicros]) => ({ currency, costMicros }))
    .sort((left, right) => codeUnitOrder(left.currency, right.currency));
}

const sumOf = (groups: readonly LedgerGroup[], pick: (group: LedgerGroup) => number): number =>
  groups.reduce((total, group) => total + pick(group), 0);

// RF-1010
export function totalsOf(groups: readonly LedgerGroup[]): UsageTotals {
  const versions = new Set(groups.map((group) => group.priceTableVersion));
  return {
    calls: sumOf(groups, (group) => group.calls),
    inputTokens: sumOf(groups, (group) => group.inputTokens),
    outputTokens: sumOf(groups, (group) => group.outputTokens),
    cachedInputTokens: sumOf(groups, (group) => group.cachedInputTokens),
    cost: costOf(groups),
    unknownCostCalls: sumOf(
      groups.filter((group) => !group.costKnown),
      (group) => group.calls,
    ),
    priceTableVersions: [...versions].sort(codeUnitOrder),
  };
}

/** The groups under each key, keys in code-unit order. */
function grouped(
  groups: readonly LedgerGroup[],
  keyOf: (group: LedgerGroup) => string,
): [string, LedgerGroup[]][] {
  const byKey = new Map<string, LedgerGroup[]>();
  for (const group of groups) {
    const key = keyOf(group);
    byKey.set(key, [...(byKey.get(key) ?? []), group]);
  }
  return [...byKey].sort(([left], [right]) => codeUnitOrder(left, right));
}

function lineOf(key: string, groups: readonly LedgerGroup[]): BreakdownLine {
  return {
    key,
    local: groups.every((group) => group.keySource === 'none'),
    totals: totalsOf(groups),
  };
}

function linesBy(
  groups: readonly LedgerGroup[],
  keyOf: (group: LedgerGroup) => string,
): BreakdownLine[] {
  return grouped(groups, keyOf).map(([key, members]) => lineOf(key, members));
}

const firstOf = (groups: readonly LedgerGroup[]): number =>
  Math.min(...groups.map((group) => group.firstAt.getTime()));

/** By run in the order the runs started; the provider tests, of no run, last. */
function runLines(groups: readonly LedgerGroup[]): RunLine[] {
  return grouped(groups, (group) => group.runId ?? TESTS_KEY)
    .map(([key, members]) => ({
      ...lineOf(key, members),
      runId: members[0]?.runId ?? null,
      firstAt: new Date(firstOf(members)),
    }))
    .sort(
      (left, right) =>
        Number(left.runId === null) - Number(right.runId === null) ||
        left.firstAt.getTime() - right.firstAt.getTime() ||
        codeUnitOrder(left.key, right.key),
    );
}

function modelLines(groups: readonly LedgerGroup[]): ModelLine[] {
  return grouped(groups, (group) => `${group.provider} ${group.model}`).map(([key, members]) => ({
    ...lineOf(key, members),
    provider: members[0]?.provider ?? '',
    model: members[0]?.model ?? '',
  }));
}

// RF-428
export function breakdownOf(groups: readonly LedgerGroup[]): CostBreakdown {
  return {
    totals: totalsOf(groups),
    byRun: runLines(groups),
    byStage: linesBy(groups, (group) => group.stage),
    byRole: linesBy(groups, (group) => group.role),
    byProvider: linesBy(groups, (group) => group.provider),
    byModel: modelLines(groups),
  };
}
