import type { RunEvent } from '../../../web/src/api/run-events.js';
import { applyEvent, initialRunState } from '../../../web/src/lib/live-run/reduce-run.js';
import type { RunState } from '../../../web/src/lib/live-run/run-state.js';

// RF-1002..RF-1004, data-model.md section 3.9: run events as the server writes them, for the
// reducer and the live run page. The run is the one the tests name `20261012-100000-understand`.

export const runKey = '20261012-100000-understand';

export const sourceState = {
  owner: 'octo',
  repo: 'demo',
  subpath: '',
  commitSha: '3f786850e387550fdab836ed7e6dc881de23001b',
} as const;

/** One event; the time is the second of its `seq` after 10:00:00. */
export function ev(
  seq: number,
  type: string,
  data: Readonly<Record<string, unknown>> = {},
  agentTaskId?: string,
): RunEvent {
  const second = String(seq % 60).padStart(2, '0');
  return {
    seq,
    at: `2026-10-12T10:00:${second}.000Z`,
    runId: runKey,
    type,
    agentTaskId,
    data,
  };
}

/** The envelope of an event as one `data:` line of the stream. */
export function wire(event: RunEvent): string {
  const { agentTaskId, ...rest } = event;
  return JSON.stringify({
    schemaVersion: 1,
    ...rest,
    ...(agentTaskId === undefined ? {} : { agentTaskId }),
  });
}

export const startedData = {
  stage: 'understand',
  source: {
    url: 'https://github.com/octo/demo',
    owner: 'octo',
    repo: 'demo',
    ref: 'main',
    commitSha: sourceState.commitSha,
    subpath: '',
    snapshotHash: null,
  },
  roles: { reader: { provider: 'ollama', model: 'qwen3.5:9b' } },
  caps: {
    run: { maxCostMicros: 2_000_000, maxTokens: 10_000 },
    roles: { reader: { maxCostMicros: null, maxTokens: null } },
  },
} as const;

export const planned = (seq: number, task: string, area: string): RunEvent =>
  ev(seq, 'agent.planned', { area, role: 'reader', model: 'qwen3.5:9b' }, task);

export const agentStarted = (seq: number, task: string, area: string): RunEvent =>
  ev(seq, 'agent.started', { area, role: 'reader', model: 'qwen3.5:9b' }, task);

export const turn = (
  seq: number,
  task: string,
  n: number,
  tokens: readonly [input: number, output: number],
): RunEvent =>
  ev(seq, 'agent.turn', { turn: n, inputTokens: tokens[0], outputTokens: tokens[1] }, task);

export const toolCalled = (
  seq: number,
  task: string,
  args: Readonly<Record<string, string | number>>,
  tool = 'read_file',
): RunEvent => ev(seq, 'agent.tool.called', { turn: 1, tool, args }, task);

export const toolResult = (seq: number, task: string, ok: boolean, tool = 'read_file'): RunEvent =>
  ev(seq, 'agent.tool.result', { turn: 1, tool, ok, ...(ok ? { linesReturned: 41 } : {}) }, task);

export const cardProposed = (seq: number, task: string, cardId: string, claims = 1): RunEvent =>
  ev(seq, 'agent.card.proposed', { cardId, type: 'BR', title: `Title of ${cardId}`, claims }, task);

/** `true` for a claim whose citation holds, else the reason it does not. */
export const citationChecked = (
  seq: number,
  task: string,
  claimId: string,
  result: true | string,
): RunEvent =>
  ev(
    seq,
    'verify.citation.checked',
    {
      claimId,
      ok: result === true,
      ...(result === true ? {} : { reason: result }),
      text: `Claim ${claimId}`,
      citations: [{ path: 'Catalog/Edit.aspx.cs', startLine: 40, endLine: 80 }],
    },
    task,
  );

export const agentEnded = (seq: number, task: string, state: string, cards = 0): RunEvent =>
  ev(seq, 'agent.ended', { state, turns: 3, cards }, task);

export const runEnded = (
  seq: number,
  endState: string,
  errorCode?: string,
  failedAreas?: number,
): RunEvent =>
  ev(seq, 'run.ended', {
    endState,
    totals: { costMicros: 4_100, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, calls: 0 },
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(failedAreas === undefined ? {} : { failedAreas }),
  });

/** The state after the events, applied in order from an empty run. */
export function stateAfter(...events: readonly RunEvent[]): RunState {
  return events.reduce(applyEvent, initialRunState());
}

// RF-209: the events of a Deepen run, as the server publishes them (data-model.md section 3.9).

export const deepenStarted = (seq: number, maxRounds = 3): RunEvent =>
  ev(seq, 'deepen.started', {
    parentRunId: 'parent-uuid',
    parentRunKey: '20261001-090000-understand',
    maxRounds,
    coveragePass: true,
    seeded: {
      cards: 24,
      claims: 118,
      supported: 68,
      rejected: 40,
      citationInvalid: 0,
      notJudged: 10,
    },
  });

export const deepenRoundStarted = (seq: number, round: number): RunEvent =>
  ev(seq, 'deepen.round.started', {
    ...{ round, maxRounds: 3, judge: 10, reread: 40 },
    outOfScope: 6,
    unreadFiles: 12,
    failedAreas: [],
  });

export const deepenRoundEnded = (seq: number, round: number, complete = true): RunEvent =>
  ev(seq, 'deepen.round.ended', {
    ...{ round, complete, newClaims: 30, newSupported: 22, filesRead: 9 },
    tokens: 90_000,
    costMicros: 120_000,
  });

export const deepenEnded = (seq: number, stopReason: string, roundsDone: number): RunEvent =>
  ev(seq, 'deepen.ended', { stopReason, roundsDone, maxRounds: 3 });
