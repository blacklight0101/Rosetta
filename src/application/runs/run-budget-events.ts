import { capWeightedTokens } from '../../domain/budget/token-usage.js';
import type { Spend } from '../../domain/budget/claim-room.js';
import type { CapBreach, UsageCap } from '../../domain/budget/usage-cap.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunEventType } from '../../domain/runs/run-event.js';
import type { BudgetEvents, RecordedCall } from '../ports/budget-events.js';
import type { CostLedger, LedgerEntry } from '../ports/cost-ledger.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { Logger } from '../ports/logger.js';

// RF-421, RF-422, RF-1003, RF-1010, ADR-007, data-model.md section 3.9: the budget events of one
// run. One instance serves every guarded provider of the run, so the totals and the warnings are
// the run's, whichever role made the call:
//   - `usage.recorded` after each answered call: the call id, role, provider, model, tokens, its
//     cost (left out when the model has no price, RF-427: unknown, never zero; a local model's
//     calls cost 0), and the run's and project's totals after it. No prompt, answer or key.
//   - `budget.warning` once per level, the first time the run's share of a run cap (cost or
//     tokens, whichever is higher) reaches 50, 80 or 95 percent.
//   - `budget.capReached` once, when a cap first refuses a call (parallel refusals give one): the
//     cap's kind as the scope, its limit and what was spent or reserved; the token cap
//     reports tokens. The cap of a role (RF-423) names its role and is reported once per role and
//     kind: it stops that role's calls only, so a later cap of the run is still reported.
// The totals start from the run's ledger rows and the project's totals when the run opens it, and
// add every call after; the ledger stays the source of truth (the page re-reads the run's total).

/** Puts one event of the run on its sink (RunEventPublisher). */
export interface BudgetEventEmitter {
  emit(
    type: RunEventType,
    data: Readonly<Record<string, unknown>>,
    agentTaskId?: string,
  ): Promise<unknown>;
}

/** Tokens and cost summed over ledger rows. */
export interface SpendTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: bigint;
}

/** P5-20: what each role has spent in the run, tokens as the caps count them (DEC-168). */
function addToRole(roles: Map<string, Spend>, entry: LedgerEntry): void {
  const before = roles.get(entry.role) ?? { tokens: 0n, micros: 0n };
  roles.set(entry.role, {
    tokens: before.tokens + capWeightedTokens(entry),
    micros: before.micros + entry.costMicros,
  });
}

export interface RunBudgetEventsParts {
  /** P5-20: the ledger rows the run had when the reporter was opened, for the spend of each role. */
  readonly rows?: readonly LedgerEntry[];
  readonly events: BudgetEventEmitter;
  /** What the run had spent when the reporter was opened. */
  readonly run: SpendTotals;
  /** What the project had spent when the reporter was opened, this run included. */
  readonly project: SpendTotals;
}

export interface OpenRunBudgetEvents {
  readonly events: BudgetEventEmitter;
  readonly run: {
    readonly userId: string;
    readonly id: string;
    readonly projectId: string;
    readonly runKey: string;
  };
  /** Where a totals read that failed is logged; the reporter then starts from zero. */
  readonly logger: Logger;
  readonly ledger: Pick<CostLedger, 'runEntries'>;
  readonly costTotals: Pick<CostTotals, 'projectGroups'>;
}

const WARNING_LEVELS = [50, 80, 95] as const;

const noSpend: SpendTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  costMicros: 0n,
};

function plus(totals: SpendTotals, rows: readonly SpendTotals[]): SpendTotals {
  return rows.reduce(
    (sum, row) => ({
      inputTokens: sum.inputTokens + row.inputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      cachedInputTokens: sum.cachedInputTokens + row.cachedInputTokens,
      costMicros: sum.costMicros + row.costMicros,
    }),
    totals,
  );
}

/** The totals as the event carries them: plain numbers (JSON has no bigint). */
function shown(totals: SpendTotals): Record<string, number> {
  const { inputTokens, outputTokens, cachedInputTokens } = totals;
  return { inputTokens, outputTokens, cachedInputTokens, costMicros: Number(totals.costMicros) };
}

/** The `usage.recorded` payload of a call; the cost is left out when it is unknown (RF-427). */
function usageData(entry: LedgerEntry): Record<string, unknown> {
  const { callId, role, provider, model, inputTokens, outputTokens, cachedInputTokens } = entry;
  return {
    ...{ callId, role, provider, model },
    tokens: { inputTokens, outputTokens, cachedInputTokens },
    ...(entry.costKnown ? { costMicros: Number(entry.costMicros) } : {}),
  };
}

/** The run's highest share of a run cap, in whole percent rounded down; 0 without a run cap. */
function runShare(totals: SpendTotals, caps: readonly UsageCap[]): number {
  const used = (cap: UsageCap): bigint =>
    cap.kind === 'run-tokens'
      ? capWeightedTokens(totals) // DEC-168: cached input counts a tenth
      : totals.costMicros;
  // DEC-193: a role's reserve line of the run cap is not a cap of the run.
  const shares = caps
    .filter((cap) => (cap.kind === 'run-cost' || cap.kind === 'run-tokens') && cap.limit > 0n)
    .filter((cap) => cap.source !== 'reserve')
    .map((cap) => Number((used(cap) * 100n) / cap.limit));
  return Math.max(0, ...shares);
}

/**
 * `budget.capReached`: a cost cap in micro-dollars, a token cap in tokens; a role cap names its role;
 * a cap with a source names it (RF-1106), so the message can say who can raise it.
 */
function capData(breach: CapBreach): Record<string, unknown> {
  const limit = Number(breach.limit);
  const spent = Number(breach.spent);
  const role = breach.role === undefined ? {} : { role: breach.role };
  const source = breach.source === undefined ? {} : { capSource: breach.source };
  return breach.kind === 'run-tokens' || breach.kind === 'role-tokens'
    ? { scope: breach.kind, ...role, ...source, capTokens: limit, spentTokens: spent }
    : { scope: breach.kind, ...role, ...source, capMicros: limit, spentMicros: spent };
}

// RF-421, RF-1003, RF-1010
export class RunBudgetEvents implements BudgetEvents {
  private readonly events: BudgetEventEmitter;
  private run: SpendTotals;
  private project: SpendTotals;
  private readonly warned = new Set<number>();
  /** Set by the first cap refusal: parallel calls refused by one cap stop the run once. */
  private capped = false;
  /** The role caps already reported (RF-423): a role's cap refuses its calls without stopping the run. */
  private readonly cappedRoles = new Set<string>();

  /** P5-20: the run's spend by role, kept with the totals so the readers' check reads no ledger. */
  private readonly roles = new Map<string, Spend>();

  /** DEC-193: the roles refused at a reserve line, and those refused at a role cap of their own. */
  private readonly atLine = new Set<string>();
  private readonly ownCap = new Set<string>();

  constructor(parts: RunBudgetEventsParts) {
    for (const row of parts.rows ?? []) addToRole(this.roles, row);
    this.events = parts.events;
    this.run = parts.run;
    this.project = parts.project;
  }

  /**
   * RF-1010: a reporter whose totals start from the run's ledger rows and the project's totals. A
   * read that fails only costs the reporting its starting point: it is logged and the totals start
   * from zero, so the run goes on.
   */
  static async open(parts: OpenRunBudgetEvents): Promise<RunBudgetEvents> {
    const { run, ledger, costTotals, events } = parts;
    try {
      const [rows, groups] = await Promise.all([
        ledger.runEntries(run.userId, run.id),
        costTotals.projectGroups(run.userId, run.projectId),
      ]);
      return new RunBudgetEvents({
        events,
        run: plus(noSpend, rows),
        rows,
        project: plus(noSpend, groups),
      });
    } catch (error) {
      const code = error instanceof RosettaError ? error.code : ERROR_CODES.costRecordFailed;
      await parts.logger.log({
        ...{ level: 'warn', logger: 'budget', code, runId: run.runKey, userId: run.userId },
        message: 'The run and project totals could not be read; the usage events start from zero.',
      });
      return new RunBudgetEvents({ events, run: noSpend, project: noSpend });
    }
  }

  /** DEC-193: the run's spend by every role, tokens as the caps count them (DEC-168). */
  runSpend(): Spend {
    return { tokens: capWeightedTokens(this.run), micros: this.run.costMicros };
  }

  /** DEC-193: whether the role's calls were refused at its reserve line and at no cap of its own. */
  stoppedAtLine(role: string): boolean {
    return this.atLine.has(role) && !this.ownCap.has(role);
  }

  /** P5-20: what the role has spent in this run, earlier sessions included. */
  roleSpend(role: string): Spend {
    return this.roles.get(role) ?? { tokens: 0n, micros: 0n };
  }

  // RF-421, RF-1003
  async callRecorded(call: RecordedCall): Promise<void> {
    const { entry, caps } = call;
    addToRole(this.roles, entry);
    this.run = plus(this.run, [entry]);
    this.project = plus(this.project, [entry]);
    const data = {
      ...usageData(entry),
      runTotals: shown(this.run),
      projectTotals: shown(this.project),
    };
    const agentTaskId = entry.agentTaskId ?? undefined;
    await this.events.emit('usage.recorded', data, agentTaskId);
    const share = runShare(this.run, caps);
    for (const level of WARNING_LEVELS) {
      if (share < level || this.warned.has(level)) continue;
      this.warned.add(level);
      await this.events.emit('budget.warning', { scope: 'run', sharePercent: level });
    }
  }

  // RF-422
  async capReached(breach: CapBreach): Promise<void> {
    if (breach.role !== undefined)
      (breach.source === 'reserve' ? this.atLine : this.ownCap).add(breach.role);
    if (breach.role === undefined) {
      if (this.capped) return;
      this.capped = true;
    } else {
      const scope = `${breach.role}/${breach.kind}`;
      if (this.cappedRoles.has(scope)) return;
      this.cappedRoles.add(scope);
    }
    await this.events.emit('budget.capReached', capData(breach));
  }
}

/** The budget events of a provider test (RF-407): it belongs to no run, so nothing is published. */
export const silentBudgetEvents: BudgetEvents = {
  callRecorded: () => Promise.resolve(),
  capReached: () => Promise.resolve(),
};
