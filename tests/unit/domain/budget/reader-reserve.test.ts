import { describe, expect, it } from 'vitest';
import { capsFor, type CapInputs } from '../../../../src/domain/budget/budget.js';

// RF-429, DEC-193 (replaces the readers' fixed 70% share of EV-27 and P3-111): the readers have no
// fixed share of the run token cap. They are held by the room check alone (their spend and the
// judging of the claims they wrote within the run cap less the summariser's part), by a reader cap
// of the project settings, and by the share of a scope cap's room (P5-18, scope-share.test.ts).

const inputs: CapInputs = {
  run: { maxCostMicros: 2_000_000n, maxTokens: 2_000_000n },
  server: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};

const roleCaps = (caps: ReturnType<typeof capsFor>) =>
  caps.filter((cap) => cap.kind.startsWith('role') || cap.source === 'reserve');

describe('the readers and the run token cap', () => {
  it('RF-429 DEC-193 a reader without a cap of its own gets no fixed share of the run token cap', () => {
    expect(roleCaps(capsFor('user', { ...inputs, reader: true }))).toEqual([]);
    expect(roleCaps(capsFor('server', { ...inputs, reader: true }))).toEqual([]);
  });

  it('RF-423 RF-429 a reader with a token cap of its own keeps it', () => {
    const caps = capsFor('user', { ...inputs, reader: true, role: { maxTokens: 9_000n } });

    expect(roleCaps(caps)).toEqual([{ kind: 'role-tokens', limit: 9_000n }]);
  });

  it('RF-423 RF-429 DEC-193 a reader with only a cost cap of its own keeps it and gets no token share', () => {
    const caps = capsFor('user', { ...inputs, reader: true, role: { maxCostMicros: 5n } });

    expect(roleCaps(caps)).toEqual([{ kind: 'role-cost', limit: 5n }]);
  });

  it('RF-429 the run token cap still applies to the readers in full (DEC-112)', () => {
    const caps = capsFor('none', { ...inputs, reader: true });

    expect(caps).toContainEqual({ kind: 'run-tokens', limit: 2_000_000n });
  });
});
