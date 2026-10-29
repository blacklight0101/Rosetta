import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JUDGING_TOKENS,
  judgingEstimate,
  roomVerdict,
} from '../../../../src/domain/budget/claim-room.js';

// RF-429, P5-20, DEC-170, DEC-193: whether the readers of a run may start another task or turn, from
// what the run, its readers and its verifier have spent, the claims written and not yet judged, and
// the caps. The verifier's room is what is left of the run cap (no fixed share), and the readers have
// no fixed share either: they stop when the run cap left, less the summariser's part, cannot hold the
// judging of the claims waiting or their next call, or at a reader cap of the project settings.

const none = { tokens: 0n, micros: 0n };

/** A run whose spend is all the readers' (`run` is the spend of every role of the run). */
const facts = {
  limits: { runTokens: 100_000n, runMicros: 1_000_000n, readerTokens: 70_000n, callTokens: 1_000n },
  run: { tokens: 30_000n, micros: 300_000n },
  readers: { tokens: 30_000n, micros: 300_000n },
  verifier: none,
  claims: { unjudged: 0, judged: 0 },
};

/** The run with the readers' spend at `tokens`, and no other role's spend. */
function readersAt(tokens: bigint, micros = 0n) {
  return { ...facts, run: { tokens, micros }, readers: { tokens, micros } };
}

/** A run without a reader cap of the project: the readers' limit is the run cap alone. */
const noReaderCap = { ...facts, limits: { ...facts.limits, readerTokens: 10_000_000n } };

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
    expect(roomVerdict({ ...facts, claims: { unjudged: 11, judged: 0 } })).toBe('open');
  });

  it('RF-429 DEC-193 EV-62: 802 claims with 5.1M of an 8M run cap left and no verifier spend keep the readers reading', () => {
    const eShop = {
      limits: {
        runTokens: 8_000_000n,
        runMicros: 0n,
        readerTokens: 8_000_000n,
        callTokens: 8_192n,
      },
      run: { tokens: 2_900_000n, micros: 0n },
      readers: { tokens: 2_900_000n, micros: 0n },
      verifier: none,
      claims: { unjudged: 802, judged: 0 },
    };

    expect(roomVerdict(eShop)).toBe('open');
  });

  it('RF-429 DEC-193 the readers stop when the run cap left, less the summariser part, cannot hold the judging', () => {
    const spent = readersAt(60_000n);

    expect(roomVerdict({ ...spent, claims: { unjudged: 15, judged: 0 } })).toBe('open');
    expect(roomVerdict({ ...spent, claims: { unjudged: 16, judged: 0 } })).toBe('judging');
  });
});

describe('whether the readers may go on, at the 90% line', () => {
  it('RF-429 claims whose judging with the readers passes 90% of the run token cap close it', () => {
    expect(roomVerdict({ ...readersAt(69_000n), claims: { unjudged: 11, judged: 0 } })).toBe(
      'judging',
    );
  });

  it('RF-429 claims whose judging with the readers passes 90% of the run cost cap close it', () => {
    const dear = readersAt(30_000n, 880_000n);

    expect(roomVerdict({ ...dear, claims: { unjudged: 2, judged: 0 } })).toBe('judging');
  });

  it('RF-429 dropping the judging estimate leaves the claims unjudged: no claim waiting is no judging check', () => {
    const many = { ...facts, claims: { unjudged: 31, judged: 0 } };

    expect(roomVerdict({ ...many, claims: { unjudged: 0, judged: 0 } })).toBe('open');
    expect(roomVerdict(many)).not.toBe('open');
  });

  it('RF-429 DEC-193 the spend of every role of the run counts, not only the readers and the verifier', () => {
    const others = { ...facts, run: { tokens: 85_000n, micros: 300_000n } };

    expect(roomVerdict({ ...others, claims: { unjudged: 3, judged: 0 } })).toBe('judging');
  });
});

describe('whether the readers may go on without a fixed share (DEC-193)', () => {
  it('RF-429 DEC-193 readers past 70% of the run token cap go on while their next call fits below 90%', () => {
    expect(roomVerdict({ ...noReaderCap, ...readersAt(85_000n), limits: noReaderCap.limits })).toBe(
      'open',
    );
  });

  it('RF-429 DEC-193 a next call that would pass the run cap less the summariser part closes it, with no claim waiting', () => {
    const full = { ...readersAt(89_500n), limits: noReaderCap.limits };

    expect(roomVerdict(full)).toBe('readers-full');
  });

  it('RF-423 RF-429 a reader cap of the project too small for one more call closes it even with no claim waiting', () => {
    expect(roomVerdict(readersAt(69_500n))).toBe('readers-full');
  });
});
