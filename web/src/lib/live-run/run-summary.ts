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

/**
 * Agents planned, running, done and failed. An agent that stopped at its turn limit still gave its
 * cards, so it counts as done; one that gave invalid output, failed, or was stopped by a cap counts
 * as failed.
 */
// RF-1002
export function overviewOf(state: RunState): Overview {
  const count = (states: readonly string[]): number =>
    state.agents.filter((agent) => states.includes(agent.state)).length;
  return {
    planned: count(['Planned']),
    running: count(['Running']),
    done: count(['Done', 'TurnLimitReached']),
    failed: count(['Failed', 'InvalidOutput', 'StoppedByCap']),
  };
}

export interface FailedArea {
  readonly area: string;
  /** The agent state, in a few words: `invalid output`, `failed`, `turn limit reached`... */
  readonly why: string;
}

const failureWords: Readonly<Record<string, string>> = {
  InvalidOutput: 'invalid output',
  Failed: 'failed',
  TurnLimitReached: 'turn limit reached without a card',
  StoppedByCap: 'stopped by a cap without a card',
};

/**
 * RF-208: the areas whose agent ended without a usable card, with why. An agent that stopped at its
 * turn limit still counts as done when it gave cards (see `overviewOf`).
 */
// RF-208
export function failedAreasOf(state: RunState): readonly FailedArea[] {
  return state.agents.flatMap((agent) => {
    const why = failureWords[agent.state];
    const gaveCards = agent.cards.length > 0;
    return why === undefined || gaveCards ? [] : [{ area: agent.area, why }];
  });
}

// RF-1003
export function roleTotalsOf(state: RunState): readonly RoleTotals[] {
  const totals = new Map<string, { input: number; output: number }>();
  for (const agent of state.agents) {
    const sum = totals.get(agent.role) ?? { input: 0, output: 0 };
    totals.set(agent.role, {
      input: sum.input + agent.inputTokens,
      output: sum.output + agent.outputTokens,
    });
  }
  // P1-96: a role with usage events takes its tokens from them (every call of the role, the
  // Ollama check included); the turns of its agents are the same calls, so they are not added.
  for (const [role, used] of Object.entries(state.roleTokens)) {
    totals.set(role, { input: used.inputTokens, output: used.outputTokens });
  }
  for (const role of Object.keys(state.roleCostMicros)) {
    if (!totals.has(role)) totals.set(role, { input: 0, output: 0 });
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, sum]) => ({
      role,
      inputTokens: sum.input,
      outputTokens: sum.output,
      costMicros: state.roleCostMicros[role],
    }));
}

/** The share of `cap` that `used` is, in whole percent and never above 100; 0 for no cap. */
// RF-1003
export function shareOf(used: number, cap: number): number {
  if (!(cap > 0)) return 0;
  return Math.min(100, Math.round((used * 100) / cap));
}

/** How many claims are in each status. */
// RF-1004
export function claimCounts(claims: readonly ClaimRow[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const claim of claims) counts[claim.status] = (counts[claim.status] ?? 0) + 1;
  return counts;
}

/**
 * A number that grows with every model turn, every end of an agent and the end of the run: the page
 * reads the run again when it changes, so the cost so far follows the run without a read per event.
 */
// RF-424
export function progressOf(state: RunState): number {
  const turns = state.agents.reduce((sum, agent) => sum + agent.turn, 0);
  const ended = state.agents.filter(
    (agent) => !['Planned', 'Running'].includes(agent.state),
  ).length;
  return turns + ended + (state.ended === undefined ? 0 : 1);
}
