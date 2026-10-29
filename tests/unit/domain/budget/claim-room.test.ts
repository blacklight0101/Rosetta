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

  it('RF-429 DEC-193 claims whose judging fits the run cap left keep it open, whatever a fixed verifier share', () => {
    const many = { ...facts, claims: { unjudged: 11, judged: 0 } };

    expect(roomVerdict(many)).toBe('open');
  });
});

describe('whether the readers may go on, with the claim-check reserve in the run cap (DEC-193)', () => {
  it('RF-429 DEC-193 EV-62: 802 claims with 5.1M of an 8M run cap left and no verifier spend keep the readers reading', () => {
    const eShop: RoomFacts = {
      limits: {
        runTokens: 8_000_000n,
        runMicros: 0n,
        readerTokens: 5_600_000n,
        callTokens: 8_192n,
      },
      readers: { tokens: 2_900_000n, micros: 0n },
      verifier: none,
      claims: { unjudged: 802, judged: 0 },
    };

    expect(roomVerdict(eShop)).not.toBe('judging');
  });

  it('RF-429 DEC-193 the readers stop when the run cap left, less the summariser part, cannot hold the judging', () => {
    const spent = { ...facts, readers: { tokens: 60_000n, micros: 0n } };

    expect(roomVerdict({ ...spent, claims: { unjudged: 15, judged: 0 } })).toBe('open');
    expect(roomVerdict({ ...spent, claims: { unjudged: 16, judged: 0 } })).toBe('judging');
  });
});

describe('whether the readers may go on, at the 90% line and the readers share', () => {
  it('RF-429 claims whose judging with the readers passes 90% of the run token cap close it', () => {
    const spent = { ...facts, readers: { tokens: 69_000n, micros: 0n } };
    const many = {
      ...spent,
      claims: { unjudged: 11, judged: 0 },
    };

    expect(roomVerdict(many)).toBe('judging');
  });

  it('RF-429 claims whose judging with the readers passes 90% of the run cost cap close it', () => {
    const dear = { ...facts, readers: { tokens: 30_000n, micros: 880_000n } };

    expect(roomVerdict({ ...dear, claims: { unjudged: 2, judged: 0 } })).toBe('judging');
  });

  it('RF-429 dropping the judging estimate leaves the claims unjudged: no claim waiting is no check', () => {
    const many = { ...facts, claims: { unjudged: 31, judged: 0 } };

    expect(roomVerdict({ ...many, claims: { unjudged: 0, judged: 0 } })).toBe('open');
    expect(roomVerdict(many)).not.toBe('open');
  });

  it('RF-429 a readers share too small for one more call closes it even with no claim waiting', () => {
    const full = { ...facts, readers: { tokens: 69_500n, micros: 0n } };

    expect(roomVerdict(full)).toBe('readers-full');
  });
});
