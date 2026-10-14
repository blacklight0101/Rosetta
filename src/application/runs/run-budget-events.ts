import type { RunEventType } from '../../domain/runs/run-event.js';
import type { CapBreach } from '../../domain/budget/usage-cap.js';
import type { BudgetEvents, RecordedCall } from '../ports/budget-events.js';
import type { CostLedger } from '../ports/cost-ledger.js';
import type { CostTotals } from '../ports/cost-totals.js';

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

export interface RunBudgetEventsParts {
  readonly events: BudgetEventEmitter;
  readonly run: SpendTotals;
  readonly project: SpendTotals;
}

export interface OpenRunBudgetEvents {
  readonly events: BudgetEventEmitter;
  readonly run: { readonly userId: string; readonly id: string; readonly projectId: string };
  readonly ledger: Pick<CostLedger, 'runEntries'>;
  readonly costTotals: Pick<CostTotals, 'projectGroups'>;
}

export class RunBudgetEvents implements BudgetEvents {
  readonly parts: RunBudgetEventsParts;

  constructor(parts: RunBudgetEventsParts) {
    this.parts = parts;
  }

  static open(parts: OpenRunBudgetEvents): Promise<RunBudgetEvents> {
    const zero = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0n };
    return Promise.resolve(new RunBudgetEvents({ events: parts.events, run: zero, project: zero }));
  }

  async callRecorded(call: RecordedCall): Promise<void> {
    await Promise.resolve(call);
  }

  async capReached(breach: CapBreach): Promise<void> {
    await Promise.resolve(breach);
  }
}

/** The budget events of a provider test (RF-407): it belongs to no run, so nothing is published. */
export const silentBudgetEvents: BudgetEvents = {
  callRecorded: () => Promise.resolve(),
  capReached: () => Promise.resolve(),
};
