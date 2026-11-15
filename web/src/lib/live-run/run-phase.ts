import type { EndReason } from '../../api/end-reason.js';
import type { RunRow } from '../../api/run-schemas.js';
import type { AwaitingState, RunState } from './run-state.js';

// RF-1108, RF-003, RF-006: where a run is, from what the page knows: the events say when it started
// and ended; the run row says so for a run whose events have not arrived yet (a queued run has none)
// and for a resumed run that waits in the queue again (its events are those of its earlier start).

export type RunPhase =
  | {
      readonly kind: 'queued';
      readonly position?: number | null;
      /** RF-1108, EV-106: the user's running run that holds this one back, if any. */
      readonly waitsFor?: RunRow['waitsFor'];
    }
  | { readonly kind: 'running' }
  /** RF-432: paused near the approved amount; `continueAmount` is the N Continue offers. */
  | { readonly kind: 'awaiting'; readonly continueAmount: AwaitingState['continueAmount'] }
  /** P8-111: `endReason` says why an `Interrupted` run ended; absent when nothing recorded it. */
  | {
      readonly kind: 'ended';
      readonly endState: string;
      readonly endReason?: EndReason | null | undefined;
    };

// RF-1108
export function phaseOf(row: RunRow, state: RunState): RunPhase {
  // P8-111: the reason comes from `run.ended`, or from the row for a run whose end event said none.
  const { ended } = state;
  if (ended !== undefined) {
    return { kind: 'ended', endState: ended.endState, endReason: ended.endReason ?? row.endReason };
  }
  // A run the row calls ended stays ended while its events replay: the page never goes back to the
  // running mode (RF-1015).
  if (row.queueState === 'Ended') {
    return { kind: 'ended', endState: row.endState ?? 'Interrupted', endReason: row.endReason };
  }
  if (queuedAgain(row, state)) return queuedOf(row);
  // RF-432: the event says it paused; a run whose events have not arrived has the row's word.
  if (state.awaiting !== undefined)
    return { kind: 'awaiting', continueAmount: state.awaiting.continueAmount };
  if (row.queueState === 'AwaitingApproval') return { kind: 'awaiting', continueAmount: undefined };
  if (state.startedAt !== undefined) return { kind: 'running' };
  if (row.queueState === 'Queued') return queuedOf(row);
  return { kind: 'running' };
}

function queuedOf(row: RunRow): RunPhase {
  return { kind: 'queued', position: row.position, waitsFor: row.waitsFor };
}

/**
 * RF-006: a resumed run that waits in the queue has the events of its earlier start (and pause);
 * the row says it was queued after that start, so it is queued until its next `run.started`.
 */
function queuedAgain(row: RunRow, state: RunState): boolean {
  const { startedAt } = state;
  if (row.queueState !== 'Queued' || row.queuedAt === undefined || startedAt === undefined) {
    return false;
  }
  return Date.parse(row.queuedAt) > Date.parse(startedAt);
}
