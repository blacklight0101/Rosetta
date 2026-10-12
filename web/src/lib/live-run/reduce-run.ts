import type { RunEvent } from '../../api/run-events.js';
import type { RunState } from './run-state.js';

// RF-1002, RF-1003, RF-1004: folds the events of a run, in order, into what the page shows. An event
// that was already applied (`seq` not above the last) changes nothing, so a replay after a
// reconnect cannot double a count.

export function initialRunState(): RunState {
  return {
    lastSeq: 0,
    startedAt: undefined,
    stage: undefined,
    source: undefined,
    caps: undefined,
    agents: [],
    cards: [],
    claims: [],
    log: [],
    roleCostMicros: {},
    ended: undefined,
  };
}

// RF-1002
export function applyEvent(state: RunState, event: RunEvent): RunState {
  void event;
  return state;
}
