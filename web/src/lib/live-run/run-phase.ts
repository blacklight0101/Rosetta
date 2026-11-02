import type { RunRow } from '../../api/run-schemas.js';
import type { AwaitingState, RunState } from './run-state.js';

// RF-1108, RF-003: where a run is, from what the page knows: the events say when it started and
// ended; the run row says so for a run whose events have not arrived yet (a queued run has none).

export type RunPhase =
  | { readonly kind: 'queued'; readonly position?: number | null }
  | { readonly kind: 'running' }
  /** RF-432: paused near the approved amount; `continueAmount` is the N Continue offers. */
  | { readonly kind: 'awaiting'; readonly continueAmount: AwaitingState['continueAmount'] }
  | { readonly kind: 'ended'; readonly endState: string };

// RF-1108
export function phaseOf(row: RunRow, state: RunState): RunPhase {
  if (state.ended !== undefined) return { kind: 'ended', endState: state.ended.endState };
  // A run the row calls ended stays ended while its events replay: the page never goes back to the
  // running mode (RF-1015).
  if (row.queueState === 'Ended') return { kind: 'ended', endState: row.endState ?? 'Interrupted' };
  // RF-432: the event says it paused; a run whose events have not arrived has the row's word.
  if (state.awaiting !== undefined)
    return { kind: 'awaiting', continueAmount: state.awaiting.continueAmount };
  if (row.queueState === 'AwaitingApproval') return { kind: 'awaiting', continueAmount: undefined };
  if (state.startedAt !== undefined) return { kind: 'running' };
  if (row.queueState === 'Queued') return { kind: 'queued', position: row.position };
  return { kind: 'running' };
}
