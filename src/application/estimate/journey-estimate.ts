import { DEEPEN_ROUNDS } from '../../domain/deepen/stop-rule.js';
import type { CostTotals, LedgerGroup } from '../ports/cost-totals.js';
import type { Project } from '../projects/project.js';
import { rolesWithoutKey, type RoleKeyDependencies } from '../runs/role-keys.js';
import type {
  ByScenario,
  EstimatePoint,
  JourneyEstimate,
  JourneyFigure,
  RoleEstimate,
} from './estimate-types.js';

// RF-430, DEC-196, ADR-026, EV-62: the likely and the worst-case total of the whole journey:
// understand with claim checking (the verifier is one of its roles), the default Deepen rounds and
// the plan. With earlier runs of the same provider and model in the cost ledger (RF-428) the
// measured totals are scaled by the source size; with none, fixed shares of the understand estimate
// stand for the Deepen rounds and the plan, and the basis says so. A pure read: no model call.
// The eShop Deepen of EV-62 needed twice the understand run, so a round is assumed to cost up to a
// whole understand run at worst and half of one likely.

/** The share of the understand estimate one Deepen round adds, likely and at worst, in percent. */
const DEEPEN_ROUND_PERCENT = { likely: 50, high: 100 } as const;
/** The share of the understand estimate the plan adds, likely and at worst, in percent. */
const PLAN_PERCENT = { likely: 10, high: 20 } as const;
/** The worst case over the measured history: half as much again. */
const HISTORY_WORST_PERCENT = 150;
/** The stages of the journey whose ledger rows count; a Deepen is an understand run. */
const JOURNEY_STAGES: readonly string[] = ['understand', 'plan'];

/** One earlier run's measured total, with the size of the source it read. */
export interface MeasuredRun {
  readonly runId: string;
  readonly sourceTokens: number;
  readonly tokens: number;
  readonly costMicros: bigint;
}

export interface JourneyInputs {
  /** The understand estimate's total (readers, verifier and summariser). */
  readonly understand: ByScenario<EstimatePoint>;
  /** The size of the source now, in the code map's estimated tokens. */
  readonly sourceTokens: number;
  readonly deepenRounds: number;
  readonly history: readonly MeasuredRun[];
}

const percentOf = (value: number, percent: number): number => Math.ceil((value * percent) / 100);
const percentOfMicros = (value: bigint, percent: number): bigint =>
  (value * BigInt(percent) + 99n) / 100n;

function figureOf(point: EstimatePoint): JourneyFigure {
  return { tokens: point.inputTokens + point.outputTokens, costMicros: point.costMicros };
}

function scaled(figure: JourneyFigure, percent: number): JourneyFigure {
  return {
    tokens: percentOf(figure.tokens, percent),
    costMicros: percentOfMicros(figure.costMicros, percent),
  };
}

function larger(a: JourneyFigure, b: JourneyFigure): JourneyFigure {
  return {
    tokens: Math.max(a.tokens, b.tokens),
    costMicros: a.costMicros > b.costMicros ? a.costMicros : b.costMicros,
  };
}

/** The measured runs, each scaled from the source it read to the source now, summed. */
function measuredTotal(history: readonly MeasuredRun[], sourceTokens: number): JourneyFigure {
  let tokens = 0;
  let costMicros = 0n;
  for (const run of history) {
    const size = Math.max(run.sourceTokens, 1);
    tokens += Math.ceil((run.tokens * sourceTokens) / size);
    costMicros += (run.costMicros * BigInt(sourceTokens) + BigInt(size - 1)) / BigInt(size);
  }
  return { tokens, costMicros };
}

// RF-430
export function journeyEstimateOf(inputs: JourneyInputs): JourneyEstimate {
  const { understand, deepenRounds, history, sourceTokens } = inputs;
  const understandHigh = figureOf(understand.high);
  if (history.length > 0) {
    const likely = measuredTotal(history, sourceTokens);
    const worstCase = larger(scaled(likely, HISTORY_WORST_PERCENT), understandHigh);
    return { basis: 'history', deepenRounds, likely, worstCase };
  }
  const journeyPercent = (scenario: 'likely' | 'high'): number =>
    100 + deepenRounds * DEEPEN_ROUND_PERCENT[scenario] + PLAN_PERCENT[scenario];
  return {
    basis: 'assumptions',
    deepenRounds,
    likely: scaled(figureOf(understand.likely), journeyPercent('likely')),
    worstCase: scaled(understandHigh, journeyPercent('high')),
  };
}

/**
 * RF-428, RF-430: the measured total of each earlier run of the journey's stages whose calls used
 * this provider (its name in the settings) and model, from the ledger's groups. A provider test has
 * no run and a scan makes no call, so neither counts. The runs read the source of `sourceTokens`.
 */
export function measuredRunsOf(
  groups: readonly LedgerGroup[],
  model: { readonly provider: string; readonly model: string },
  sourceTokens: number,
): readonly MeasuredRun[] {
  const runs = new Map<string, MeasuredRun>();
  for (const group of groups) {
    if (group.runId === null || !JOURNEY_STAGES.includes(group.stage)) continue;
    if (group.provider !== model.provider || group.model !== model.model) continue;
    const before = runs.get(group.runId);
    runs.set(group.runId, {
      runId: group.runId,
      sourceTokens,
      tokens: (before?.tokens ?? 0) + group.inputTokens + group.outputTokens,
      costMicros: (before?.costMicros ?? 0n) + group.costMicros,
    });
  }
  return [...runs.values()];
}

/** What the understand estimate reads besides its own figures (RF-430, RF-431). */
export interface JourneyDependencies {
  /** RF-431: whether each role has a usable key; every role counts as served when absent. */
  readonly roleKeys?: RoleKeyDependencies;
  /** RF-430, RF-428: the measured totals of earlier runs; the fixed assumptions when absent. */
  readonly history?: Pick<CostTotals, 'projectGroups'>;
}

/**
 * RF-430, RF-431: the roles of the understand estimate with the ones whose key is missing marked,
 * and the journey total over the history of the reader's provider and model on this project.
 */
export async function journeyOfEstimate(
  deps: JourneyDependencies,
  project: Project,
  estimate: {
    readonly roles: readonly RoleEstimate[];
    readonly total: ByScenario<EstimatePoint>;
    readonly sourceTokens: number;
  },
): Promise<{ readonly roles: readonly RoleEstimate[]; readonly journey: JourneyEstimate }> {
  const { roles, total, sourceTokens } = estimate;
  const missing =
    deps.roleKeys === undefined
      ? []
      : await rolesWithoutKey(
          deps.roleKeys,
          project,
          roles.map((role) => role.role),
        );
  const marked = roles.map((role) =>
    missing.includes(role.role) ? { ...role, keyMissing: true as const } : role,
  );
  const reader = roles.find((role) => role.role === 'reader');
  const groups =
    deps.history === undefined || reader === undefined
      ? []
      : await deps.history.projectGroups(project.userId, project.id);
  const history =
    reader === undefined
      ? []
      : measuredRunsOf(groups, { provider: reader.provider, model: reader.model }, sourceTokens);
  const deepenRounds = DEEPEN_ROUNDS.default;
  return {
    roles: marked,
    journey: journeyEstimateOf({ understand: total, sourceTokens, deepenRounds, history }),
  };
}
