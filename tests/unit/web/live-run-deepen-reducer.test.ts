import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { applyEvent, initialRunState } from '../../../web/src/lib/live-run/reduce-run.js';
import {
  deepenEnded,
  deepenRoundEnded,
  deepenRoundStarted,
  deepenStarted,
  ev,
  runEnded,
  stateAfter,
} from './live-run-fixtures.js';

// RF-209, RF-1002: what the run page knows of a Deepen, folded from its events: the cards it starts
// from, each round as it begins and ends, and why it stopped. A reload and the replay fold the same
// events, so they end with the state the live page had.

const lines = (...events: readonly RunEvent[]): readonly string[] =>
  stateAfter(...events).log.map((line) => line.text);

describe('RF-209 the Deepen progress of the run page', () => {
  it('RF-209 starts from the cards the Deepen was seeded with', () => {
    const state = stateAfter(deepenStarted(1));

    expect(state.deepen).toEqual({
      parentRunId: 'parent-uuid',
      parentRunKey: '20261001-090000-understand',
      maxRounds: 3,
      coveragePass: true,
      seeded: { cards: 24, claims: 118, supported: 68, rejected: 40, notJudged: 10 },
      rounds: [],
      stop: undefined,
    });
  });

  it('RF-209 shows a round as running from its start and as done at its end', () => {
    const running = stateAfter(deepenStarted(1), deepenRoundStarted(2, 1)).deepen;
    const done = stateAfter(
      deepenStarted(1),
      deepenRoundStarted(2, 1),
      deepenRoundEnded(3, 1),
    ).deepen;

    expect(running?.rounds).toEqual([
      {
        ...{ round: 1, status: 'running', judge: 10, reread: 40, outOfScope: 6 },
        ...{ unreadFiles: 12, newClaims: 0, newSupported: 0, filesRead: 0 },
      },
    ]);
    expect(done?.rounds[0]).toMatchObject({
      ...{ round: 1, status: 'done', newClaims: 30, newSupported: 22, filesRead: 9 },
    });
  });

  it('RF-209 shows a round a cap or a Stop cut short as cut', () => {
    const state = stateAfter(
      deepenStarted(1),
      deepenRoundStarted(2, 1),
      deepenRoundEnded(3, 1, false),
    );

    expect(state.deepen?.rounds.map((round) => round.status)).toEqual(['cut']);
  });
});

describe('RF-209 the end of a Deepen', () => {
  it('RF-209 records why the Deepen stopped', () => {
    const state = stateAfter(
      deepenStarted(1),
      deepenRoundStarted(2, 1),
      deepenRoundEnded(3, 1),
      deepenEnded(4, 'noProgress', 1),
    );

    expect(state.deepen?.stop).toEqual({ reason: 'noProgress', roundsDone: 1 });
  });
});

describe('RF-006 a resumed Deepen', () => {
  it('RF-006 goes on from the rounds it had when a resumed Deepen starts again', () => {
    const state = stateAfter(
      deepenStarted(1),
      deepenRoundStarted(2, 1),
      deepenRoundEnded(3, 1, false),
      deepenEnded(4, 'capReached', 0),
      runEnded(5, 'CapReached'),
      ev(6, 'run.started', { stage: 'understand' }),
      {
        ...deepenStarted(7),
        data: {
          ...deepenStarted(7).data,
          seeded: { cards: 1, claims: 1, supported: 1, rejected: 0, notJudged: 0 },
        },
      },
      deepenRoundStarted(8, 2),
    );

    expect(state.deepen?.stop).toBeUndefined();
    expect(state.deepen?.seeded.cards).toBe(24);
    expect(state.deepen?.rounds.map((round) => [round.round, round.status])).toEqual([
      [1, 'cut'],
      [2, 'running'],
    ]);
  });
});

describe('RF-1002 the log of a Deepen', () => {
  it('RF-1002 ignores an event it already applied and one whose data does not fit', () => {
    const events = [deepenStarted(1), deepenRoundStarted(2, 1), deepenRoundEnded(3, 1)];
    const once = stateAfter(...events);

    expect(applyEvent(once, deepenRoundEnded(3, 1))).toBe(once);
    expect(stateAfter(ev(1, 'deepen.started', { maxRounds: 'many' })).deepen).toBeUndefined();
    expect(stateAfter(ev(1, 'deepen.round.started', { round: 1 })).deepen).toBeUndefined();
  });

  it('RF-1002 reaches the same state one event at a time as from the whole log', () => {
    const events = [deepenStarted(1), deepenRoundStarted(2, 1), deepenRoundEnded(3, 1)];

    const live = events.reduce(applyEvent, initialRunState());

    expect(live).toEqual(stateAfter(...events));
  });
});

describe('RF-209 the Deepen lines of the log', () => {
  it('RF-209 words each Deepen event for the activity log', () => {
    expect(
      lines(
        deepenStarted(1),
        deepenRoundStarted(2, 1),
        deepenRoundEnded(3, 1),
        deepenEnded(4, 'roundLimit', 3),
      ),
    ).toEqual([
      'from run 20261001-090000-understand: 24 cards, 118 claims · up to 3 rounds',
      'round 1 of 3: judge 10, re-read 40, 12 unread files',
      'round 1 ended · 30 new claims, 22 supported, 9 files read',
      'stopped: roundLimit after 3 rounds',
    ]);
  });
});

describe('RF-1002 Deepen events out of order', () => {
  it('RF-1002 ignores a round that begins or ends, or a stop, before the Deepen started', () => {
    const state = stateAfter(
      deepenRoundStarted(1, 1),
      deepenRoundEnded(2, 1),
      deepenEnded(3, 'x', 1),
    );

    expect(state.deepen).toBeUndefined();
  });

  it('RF-1002 ignores the end of a round that never began', () => {
    const state = stateAfter(deepenStarted(1), deepenRoundEnded(2, 4));

    expect(state.deepen?.rounds).toEqual([]);
  });

  it('RF-1002 keeps the rounds in order when a later one is announced first', () => {
    const state = stateAfter(deepenStarted(1), deepenRoundStarted(2, 2), deepenRoundStarted(3, 1));

    expect(state.deepen?.rounds.map((round) => round.round)).toEqual([1, 2]);
  });
});
