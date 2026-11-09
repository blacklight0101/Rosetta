import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { applyEvent, initialRunState } from '../../../web/src/lib/live-run/reduce-run.js';
import type { RunState } from '../../../web/src/lib/live-run/run-state.js';
import {
  agentEnded,
  agentStarted,
  ev,
  runEnded,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';

// RF-1002 (P8-60), data-model.md section 3.9 "Calls in flight": the calls each role has in flight
// and the limit, kept in the run state from the events of the run, also when the stored log is
// replayed after a reload.

const verifierTask = 'verifier-001';

const runStarted = (seq: number, parallelism?: number): RunEvent =>
  ev(seq, 'run.started', {
    ...startedData,
    ...(parallelism === undefined ? {} : { parallelism }),
  });

const claimStarted = (seq: number, claimId: string): RunEvent =>
  ev(seq, 'verify.claim.started', { claimId }, verifierTask);

const claimCallEnded = (seq: number, claimId: string): RunEvent =>
  ev(seq, 'verify.claim.callEnded', { claimId }, verifierTask);

const claimJudged = (seq: number, claimId: string): RunEvent =>
  ev(seq, 'verify.claim.judged', { claimId, status: 'Supported', reason: 'Holds.' }, verifierTask);

const judgementStarted = (seq: number): RunEvent => ev(seq, 'verify.judgement.started', {});
const judgementEnded = (seq: number): RunEvent => ev(seq, 'verify.judgement.ended', {});

/** The counts and the limit the role lines are drawn from. */
function counts(state: RunState): { reader: number; verifier: number; limit: number | undefined } {
  const { reader, verifier, limit } = state.inFlight;
  return { reader: reader.length, verifier: verifier.length, limit };
}

/** A judgement step at parallelism 4: four claims in flight at once, then each call ends. */
const fourAtOnce: readonly RunEvent[] = [
  runStarted(1, 4),
  judgementStarted(2),
  claimStarted(3, 'BR-001.c1'),
  claimStarted(4, 'BR-001.c2'),
  claimStarted(5, 'BR-002.c1'),
  claimStarted(6, 'BR-002.c2'),
  claimCallEnded(7, 'BR-001.c2'),
  claimStarted(8, 'BR-003.c1'),
  claimCallEnded(9, 'BR-001.c1'),
  claimCallEnded(10, 'BR-002.c1'),
  claimCallEnded(11, 'BR-002.c2'),
  claimCallEnded(12, 'BR-003.c1'),
  judgementEnded(13),
];

describe('the calls in flight', () => {
  it('RF-1002 start at 0 with no limit before the run starts', () => {
    expect(counts(initialRunState())).toEqual({ reader: 0, verifier: 0, limit: undefined });
  });

  it('RF-1002 take the limit from the parallelism of run.started', () => {
    expect(counts(stateAfter(runStarted(1, 4)))).toEqual({ reader: 0, verifier: 0, limit: 4 });
  });

  it('RF-1002 count with no limit for a run stored without parallelism', () => {
    const state = stateAfter(
      runStarted(1),
      agentStarted(2, 'reader-001', 'Catalog'),
      judgementStarted(3),
      claimStarted(4, 'BR-001.c1'),
    );

    expect(counts(state)).toEqual({ reader: 1, verifier: 1, limit: undefined });
  });
});

describe('the readers in flight', () => {
  it('RF-1002 count the agent.started events that have no agent.ended yet', () => {
    const live = [
      runStarted(1, 4),
      agentStarted(2, 'reader-001', 'Catalog'),
      agentStarted(3, 'reader-002', 'Orders'),
      agentEnded(4, 'reader-001', 'Done', 2),
      agentEnded(5, 'reader-002', 'Failed'),
    ].reduce<number[]>((seen, _, index, all) => {
      const state = stateAfter(...all.slice(0, index + 1));
      return [...seen, state.inFlight.reader.length];
    }, []);

    expect(live).toEqual([0, 1, 2, 1, 0]);
  });

  it('RF-1002 do not count a reader twice, nor go below 0 for an agent.ended of no started reader', () => {
    const state = stateAfter(
      agentStarted(1, 'reader-001', 'Catalog'),
      agentStarted(2, 'reader-001', 'Catalog'),
      agentEnded(3, 'reader-009', 'Done'),
    );

    expect(state.inFlight.reader).toEqual(['reader-001']);
  });
});

describe('the verifier calls in flight', () => {
  it('RF-1002 count four claims in flight at parallelism 4, with the limit, and 0 when the step ends', () => {
    const states = fourAtOnce.map((_, index) => stateAfter(...fourAtOnce.slice(0, index + 1)));

    expect(states.map((state) => state.inFlight.verifier.length)).toEqual([
      0, 0, 1, 2, 3, 4, 3, 4, 3, 2, 1, 0, 0,
    ]);
    expect(states[5]?.inFlight).toMatchObject({
      verifier: ['BR-001.c1', 'BR-001.c2', 'BR-002.c1', 'BR-002.c2'],
      limit: 4,
    });
  });

  it('RF-1002 change nothing at a verify.claim.callEnded of a claim id not in flight', () => {
    const before = stateAfter(runStarted(1, 4), judgementStarted(2), claimStarted(3, 'BR-001.c1'));

    const after = applyEvent(before, claimCallEnded(4, 'BR-009.c1'));

    expect(after.inFlight.verifier).toEqual(['BR-001.c1']);
    expect(
      applyEvent(stateAfter(runStarted(1, 4)), claimCallEnded(2, 'BR-001.c1')).inFlight,
    ).toMatchObject({ verifier: [] });
  });

  it('RF-1002 keep a claim counted until its call ends, whatever verdict arrived', () => {
    const state = stateAfter(
      judgementStarted(1),
      claimStarted(2, 'BR-001.c1'),
      claimStarted(3, 'BR-001.c2'),
      claimJudged(4, 'BR-001.c1'),
      claimCallEnded(5, 'BR-001.c2'),
    );

    expect(state.inFlight.verifier).toEqual(['BR-001.c1']);
  });

  it('RF-1002 count 0 for a log without verify.claim.started, whatever the verdicts', () => {
    const state = stateAfter(
      runStarted(1, 4),
      judgementStarted(2),
      claimJudged(3, 'BR-001.c1'),
      claimJudged(4, 'BR-001.c2'),
    );

    expect(state.inFlight.verifier).toEqual([]);
  });
});

describe('a claim started twice', () => {
  it('RF-1002 count a claim once when its verify.claim.started comes a second time', () => {
    const started = stateAfter(claimStarted(1, 'c1'), claimStarted(2, 'c1'));

    expect(started.inFlight.verifier).toEqual(['c1']);
    expect(started.inFlight.verifier).toHaveLength(1);
    expect(applyEvent(started, claimCallEnded(3, 'c1')).inFlight.verifier).toHaveLength(0);
  });
});

describe('the step events', () => {
  it('RF-1002 empty the set at verify.judgement.started', () => {
    const state = stateAfter(
      claimStarted(1, 'BR-001.c1'),
      claimStarted(2, 'BR-001.c2'),
      judgementStarted(3),
    );

    expect(state.inFlight.verifier).toEqual([]);
  });

  it('RF-1002 empty the set at verify.judgement.ended', () => {
    const state = stateAfter(
      judgementStarted(1),
      claimStarted(2, 'BR-001.c1'),
      claimStarted(3, 'BR-001.c2'),
      judgementEnded(4),
    );

    expect(state.inFlight.verifier).toEqual([]);
  });

  it('RF-1002 empty the set at run.ended', () => {
    const state = stateAfter(
      runStarted(1, 4),
      judgementStarted(2),
      claimStarted(3, 'BR-001.c1'),
      runEnded(4, 'Interrupted'),
    );

    expect(state.inFlight).toMatchObject({ verifier: [], limit: 4 });
  });

  it('RF-1002 empty the readers at run.ended, so a reader whose agent.ended was lost is not counted after a resume', () => {
    const state = stateAfter(
      runStarted(1, 4),
      agentStarted(2, 'reader-001', 'Catalog'),
      runEnded(3, 'Interrupted'),
      runStarted(4, 4),
    );

    expect(counts(state)).toEqual({ reader: 0, verifier: 0, limit: 4 });
  });
});

describe('a reload of the page', () => {
  it('RF-1002 replays the stored log to the counts the live page had after each event', () => {
    const log = [
      runStarted(1, 4),
      agentStarted(2, 'reader-001', 'Catalog'),
      agentStarted(3, 'reader-002', 'Orders'),
      agentEnded(4, 'reader-001', 'Done', 1),
      ...fourAtOnce.slice(1, 6).map((event) => ({ ...event, seq: event.seq + 3 })),
    ];
    let live = initialRunState();
    for (const [index, event] of log.entries()) {
      live = applyEvent(live, event);
      const replayed = stateAfter(...log.slice(0, index + 1));
      expect(replayed.inFlight).toEqual(live.inFlight);
    }

    expect(counts(live)).toEqual({ reader: 1, verifier: 4, limit: 4 });
  });

  it('RF-1002 does not double the counts when events already applied arrive again', () => {
    const live = stateAfter(...fourAtOnce.slice(0, 6));

    const again = fourAtOnce.slice(0, 6).reduce(applyEvent, live);

    expect(counts(again)).toEqual({ reader: 0, verifier: 4, limit: 4 });
  });
});
