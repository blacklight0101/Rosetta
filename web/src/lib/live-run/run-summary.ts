import type { ClaimRow, RunState } from './run-state.js';

// RF-1002, RF-1003, RF-1004: the figures the overview and the meter show, taken from the state.

export interface Overview {
  readonly planned: number;
  readonly running: number;
  readonly done: number;
  readonly failed: number;
}

export interface RoleTotals {
  readonly role: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Undefined until a `usage.recorded` event of the role arrived. */
  readonly costMicros: number | undefined;
}

// RF-1002
export function overviewOf(state: RunState): Overview {
  void state;
  return { planned: 0, running: 0, done: 0, failed: 0 };
}

// RF-1003
export function roleTotalsOf(state: RunState): readonly RoleTotals[] {
  void state;
  return [];
}

/** The share of `cap` that `used` is, in whole percent and never above 100; 0 for no cap. */
// RF-1003
export function shareOf(used: number, cap: number): number {
  void used;
  void cap;
  return -1;
}

// RF-1004
export function claimCounts(claims: readonly ClaimRow[]): Readonly<Record<string, number>> {
  void claims;
  return {};
}
