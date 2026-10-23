import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JUDGING_TOKENS,
  judgingEstimate,
  roomVerdict,
  type RoomFacts,
} from '../../../../src/domain/budget/claim-room.js';

// RF-429, P5-20, DEC-170: whether the readers of a run may start another task or turn, from what the
// readers and the verifier have spent, the claims written and not yet judged, and the caps.

const none = { tokens: 0n, micros: 0n };

const facts: RoomFacts = {
  limits: {
    runTokens: 100_000n,
    runMicros: 1_000_000n,
    readerTokens: 70_000n,
    verifierTokens: 20_000n,
    callTokens: 1_000n,
  },
  readers: { tokens: 30_000n, micros: 300_000n },
  verifier: none,
  claims: { unjudged: 0, judged: 0 },
};

describe('the estimate of judging one claim', () => {
  it('RF-429 uses the stated default tokens before the first judgement', () => {
    expect(judgingEstimate(facts).tokens).toBe(DEFAULT_JUDGING_TOKENS);
  });

  it('RF-429 prices the default at what a reader token has cost the run so far', () => {
    expect(judgingEstimate(facts).micros).toBe((DEFAULT_JUDGING_TOKENS * 300_000n) / 30_000n);
  });

  it('RF-429 uses the average verifier spend per judged claim once claims are judged', () => {
    const judged = {
      ...facts,
      verifier: { tokens: 3_000n, micros: 600n },
      claims: { unjudged: 5, judged: 3 },
    };

    expect(judgingEstimate(judged)).toEqual({ tokens: 1_000n, micros: 200n });
  });
});

describe('whether the readers may go on', () => {
  it('RF-429 a run with no claim waiting is open', () => {
    expect(roomVerdict(facts)).toBe('open');
  });

  it('RF-429 a few claims leave the run open', () => {
    expect(roomVerdict({ ...facts, claims: { unjudged: 3, judged: 0 } })).toBe('open');
  });

  it('RF-429 claims whose judging would pass the verifier share close it for judging', () => {
    const many = { ...facts, claims: { unjudged: 11, judged: 0 } };

    expect(roomVerdict(many)).toBe('judging');
  });

  it('RF-429 claims whose judging with the readers passes 90% of the run token cap close it', () => {
    const spent = { ...facts, readers: { tokens: 69_000n, micros: 0n } };
    const many = {
      ...spent,
      limits: { ...facts.limits, verifierTokens: 90_000n },
      claims: { unjudged: 11, judged: 0 },
    };

    expect(roomVerdict(many)).toBe('judging');
  });

  it('RF-429 claims whose judging with the readers passes 90% of the run cost cap close it', () => {
    const dear = { ...facts, readers: { tokens: 30_000n, micros: 880_000n } };

    expect(roomVerdict({ ...dear, claims: { unjudged: 2, judged: 0 } })).toBe('judging');
  });

  it('RF-429 dropping the judging estimate leaves the claims unjudged: no claim waiting is no check', () => {
    const many = { ...facts, claims: { unjudged: 11, judged: 0 } };

    expect(roomVerdict({ ...many, claims: { unjudged: 0, judged: 0 } })).toBe('open');
    expect(roomVerdict(many)).not.toBe('open');
  });

  it('RF-429 a readers share too small for one more call closes it even with no claim waiting', () => {
    const full = { ...facts, readers: { tokens: 69_500n, micros: 0n } };

    expect(roomVerdict(full)).toBe('readers-full');
  });
});
