import type { RunEvent } from '../../api/run-events.js';
import {
  deepenEndedData,
  deepenRoundEndedData,
  deepenRoundStartedData,
  deepenStartedData,
} from './event-data.js';
import type { DeepenProgress, DeepenRoundState, RunState } from './run-state.js';

// RF-209, RF-006, RF-1002: what the `deepen.*` events change: the cards a Deepen starts from, each
// round as it begins and ends, and why it stopped. An event that does not fit changes nothing. A
// resumed Deepen publishes `deepen.started` again: it keeps the rounds and the cards it had, and is
// not stopped any more. A round a cap cut short stays `cut`; the resume's next round has the next
// number.

function withRound(progress: DeepenProgress, round: DeepenRoundState): readonly DeepenRoundState[] {
  const others = progress.rounds.filter((each) => each.round !== round.round);
  return [...others, round].sort((left, right) => left.round - right.round);
}

/** The claims no named group holds: what an event written before citationInvalid left out. */
function unnamed(seeded: {
  claims: number;
  supported: number;
  rejected: number;
  notJudged: number;
}): number {
  return Math.max(0, seeded.claims - seeded.supported - seeded.rejected - seeded.notJudged);
}

// RF-209
export function onDeepenStarted(state: RunState, event: RunEvent): RunState {
  const parsed = deepenStartedData.safeParse(event.data);
  if (!parsed.success) return state;
  const { parentRunId, parentRunKey, maxRounds, coveragePass, seeded } = parsed.data;
  const first: DeepenProgress = {
    ...{ parentRunId, parentRunKey, maxRounds, coveragePass },
    seeded: { ...seeded, citationInvalid: seeded.citationInvalid ?? unnamed(seeded) },
    rounds: [],
    stop: undefined,
  };
  const deepen = state.deepen === undefined ? first : { ...state.deepen, stop: undefined };
  return { ...state, deepen };
}

// RF-209
export function onDeepenRoundStarted(state: RunState, event: RunEvent): RunState {
  const parsed = deepenRoundStartedData.safeParse(event.data);
  if (!parsed.success || state.deepen === undefined) return state;
  const { round, judge, reread, outOfScope, unreadFiles, failedAreas } = parsed.data;
  const running: DeepenRoundState = {
    ...{ round, status: 'running', judge, reread, outOfScope, unreadFiles, failedAreas },
    ...{ newClaims: 0, newSupported: 0, filesRead: 0 },
  };
  return { ...state, deepen: { ...state.deepen, rounds: withRound(state.deepen, running) } };
}

// RF-209
export function onDeepenRoundEnded(state: RunState, event: RunEvent): RunState {
  const parsed = deepenRoundEndedData.safeParse(event.data);
  if (!parsed.success || state.deepen === undefined) return state;
  const { round, complete, newClaims, newSupported, filesRead } = parsed.data;
  const begun = state.deepen.rounds.find((each) => each.round === round);
  if (begun === undefined) return state;
  const ended: DeepenRoundState = {
    ...begun,
    ...{ status: complete ? 'done' : 'cut', newClaims, newSupported, filesRead },
  };
  return { ...state, deepen: { ...state.deepen, rounds: withRound(state.deepen, ended) } };
}

// RF-209
export function onDeepenEnded(state: RunState, event: RunEvent): RunState {
  const parsed = deepenEndedData.safeParse(event.data);
  if (!parsed.success || state.deepen === undefined) return state;
  const stop = { reason: parsed.data.stopReason, roundsDone: parsed.data.roundsDone };
  return { ...state, deepen: { ...state.deepen, stop } };
}
