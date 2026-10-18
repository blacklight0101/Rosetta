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
import {
  onCardsMerged,
  onCitationChecked,
  onClaimJudged,
  onClaimsProposed,
} from './claim-events.js';
import {
  onDeepenEnded,
  onDeepenRoundEnded,
  onDeepenRoundStarted,
  onDeepenStarted,
} from './deepen-events.js';
import { logText } from './log-text.js';
import type { RunState } from './run-state.js';
import { onRunEnded, onRunStarted, onScanCompleted, onSourceResolved } from './run-level-events.js';

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
  'scan.completed': onScanCompleted,
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
  // RF-250: the merge renumbered claims; their rows follow.
  'cards.merged': onCardsMerged,
  // RF-209: a Deepen run's cards, rounds and stop.
  'deepen.started': onDeepenStarted,
  'deepen.round.started': onDeepenRoundStarted,
  'deepen.round.ended': onDeepenRoundEnded,
  'deepen.ended': onDeepenEnded,
  // RF-1014: the judgement step's start and end; the claims wait for it only in between (or before).
  'verify.judgement.started': (state) => ({ ...state, judgement: 'running' }),
  'verify.judgement.ended': (state) => ({ ...state, judgement: 'ended' }),
};

export function initialRunState(): RunState {
  return {
    lastSeq: 0,
    startedAt: undefined,
    stage: undefined,
    source: undefined,
    caps: undefined,
    scan: undefined,
    agents: [],
    cards: [],
    claims: [],
    judgement: 'idle',
    log: [],
    roleCostMicros: {},
    roleTokens: {},
    deepen: undefined,
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
