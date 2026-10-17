import { z } from 'zod';
import { totalsOf } from '../budget/cost-breakdown.js';
import type { SummaryGroup } from '../ports/cost-totals.js';
import type {
  ReportCost,
  ReportCostLine,
  ReportCoverage,
  ReportCoverageArea,
  ReportProjectTotals,
} from './report-model.js';

// RF-500, RF-230, RF-426, RF-1010: the figures of the dashboard and the cost page, read from the
// files the run wrote (`coverage.json`, `cost.json`; data-model.md sections 3.8 and 3.12) and from the
// ledger. A file that is missing, torn or of another version gives none: the report is still built,
// and says the figures are not available.

const count = z.number().int().min(0);

const coverageSchema = z.object({
  schemaVersion: z.literal(1),
  areas: z.array(
    z.object({
      area: z.string(),
      files: z.array(z.object({ path: z.string(), read: z.array(z.unknown()) })),
      tokens: count,
      readTokens: count,
      readTokenShare: z.number().min(0).max(1),
      failure: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
});

const figures = {
  inputTokens: count,
  outputTokens: count,
  cachedInputTokens: count,
  calls: count,
  costMicros: count,
};

const costSchema = z.object({
  schemaVersion: z.literal(1),
  currency: z.string(),
  priceTableVersion: z.string(),
  totals: z.object({
    ...figures,
    cacheWriteInputTokens: count.default(0),
    cacheWriteCostMicros: count.default(0),
    unpricedCalls: count.default(0),
  }),
  byRole: z.array(z.object({ role: z.string(), ...figures })),
  byProvider: z.array(z.object({ provider: z.string(), ...figures })),
  byModel: z.array(z.object({ provider: z.string(), model: z.string(), ...figures })),
});

function parsedJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // A torn or foreign file holds no figures: the report then says they are not available.
    return undefined;
  }
}

/** The share of tokens read, 0 to 1 with four decimals; 0 when nothing was to be read. */
function share(read: number, all: number): number {
  return all === 0 ? 0 : Math.round((read / all) * 10_000) / 10_000;
}

/** The coverage of a `coverage.json` text; none when it is missing or is not a version 1 file. */
// RF-500
export function parseCoverage(text: string | undefined): ReportCoverage | null {
  const parsed = coverageSchema.safeParse(parsedJson(text));
  if (!parsed.success) return null;
  const { areas } = parsed.data;
  const rows: ReportCoverageArea[] = areas.map((each) => ({
    area: each.area,
    filesListed: each.files.length,
    filesRead: each.files.filter((file) => file.read.length > 0).length,
    readTokenShare: each.readTokenShare,
    ...(each.failure === undefined ? {} : { failure: each.failure }),
    ...(each.note === undefined ? {} : { note: each.note }),
  }));
  const sum = (pick: (each: (typeof areas)[number]) => number): number =>
    areas.reduce((total, each) => total + pick(each), 0);
  return {
    filesListed: rows.reduce((total, each) => total + each.filesListed, 0),
    filesRead: rows.reduce((total, each) => total + each.filesRead, 0),
    readTokenShare: share(
      sum((each) => each.readTokens),
      sum((each) => each.tokens),
    ),
    areas: rows,
  };
}

function lineOf(key: string, line: Omit<ReportCostLine, 'key'>): ReportCostLine {
  const { inputTokens, outputTokens, cachedInputTokens, calls, costMicros } = line;
  return { key, inputTokens, outputTokens, cachedInputTokens, calls, costMicros };
}

/** The cost report of a `cost.json` text; none when it is missing or is not a version 1 file. */
// RF-500, RF-426
export function parseCostReport(text: string | undefined): ReportCost | null {
  const parsed = costSchema.safeParse(parsedJson(text));
  if (!parsed.success) return null;
  const { currency, priceTableVersion, totals, byRole, byProvider, byModel } = parsed.data;
  return {
    currency,
    priceTableVersion,
    totals,
    byRole: byRole.map((each) => lineOf(each.role, each)),
    byProvider: byProvider.map((each) => lineOf(each.provider, each)),
    byModel: byModel.map((each) => lineOf(`${each.provider} ${each.model}`, each)),
  };
}

/** What the ledger says the project has spent: the groups added up, the cost per currency (RF-1010). */
// RF-1010
export function projectTotalsOf(groups: readonly SummaryGroup[]): ReportProjectTotals {
  const { calls, inputTokens, outputTokens, cachedInputTokens, cost, unknownCostCalls } =
    totalsOf(groups);
  return {
    ...{ calls, inputTokens, outputTokens, cachedInputTokens, unknownCostCalls },
    cost: cost.map(({ currency, costMicros }) => ({ currency, costMicros: Number(costMicros) })),
  };
}
