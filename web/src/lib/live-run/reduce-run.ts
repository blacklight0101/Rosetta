import type { RunEvent } from '../../api/run-events.js';
import {
  onAgentEnded,
  onCardProposed,
  onPlanned,
  onStarted,
  onToolCalled,
  onToolResult,
  onTurn,
  onUsage,
} from './agent-events.js';
import { onCitationChecked, onClaimJudged, onClaimsProposed } from './claim-events.js';
import { logText } from './log-text.js';
import type { RunState } from './run-state.js';
import { onRunEnded, onRunStarted, onSourceResolved } from './run-level-events.js';

// RF-1002, RF-1003, RF-1004: folds the events of a run, in order, into what the page shows. An event
// that was already applied (`seq` not above the last) changes nothing, so a replay after a
// reconnect cannot double a count. Every event, whatever its type, becomes a line of the log; the
// log keeps the newest events when a run has more than `LOG_LIMIT`.

/** The log keeps this many of the newest events; the sequence numbers show how many came before. */
const LOG_LIMIT = 1000;

type Handler = (state: RunState, event: RunEvent) => RunState;

const handlers: Readonly<Record<string, Handler>> = {
  'run.started': onRunStarted,
  'source.resolved': onSourceResolved,
  'run.ended': onRunEnded,
  'agent.planned': onPlanned,
  'agent.started': onStarted,
  'agent.turn': onTurn,
  'agent.tool.called': onToolCalled,
  'agent.tool.result': onToolResult,
  'agent.ended': onAgentEnded,
  'usage.recorded': onUsage,
  'agent.card.proposed': (state, event) => onClaimsProposed(onCardProposed(state, event), event),
  'verify.citation.checked': onCitationChecked,
  'verify.claim.judged': onClaimJudged,
};

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
  if (event.seq <= state.lastSeq) return state;
  const handler = Object.hasOwn(handlers, event.type) ? handlers[event.type] : undefined;
  const changed = handler === undefined ? state : handler(state, event);
  const area = changed.agents.find((agent) => agent.agentTaskId === event.agentTaskId)?.area ?? '';
  const line = { seq: event.seq, at: event.at, type: event.type, text: logText(event, area) };
  return { ...changed, lastSeq: event.seq, log: [...changed.log, line].slice(-LOG_LIMIT) };
}
