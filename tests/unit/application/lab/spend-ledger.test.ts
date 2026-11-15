import { describe, expect, it } from 'vitest';
import {
  HOLD_TTL_MS,
  decideHold,
  ledgerTotals,
  parseLedgerText,
  type LedgerLimits,
  type LedgerLine,
} from '../../../../src/application/lab/spend-ledger.js';

// RF-1402, ADR-029: the ledger is append-only lines of hold, settle and release; a hold is judged on
// the lines up to its own, so two processes never pass a cap together.

const limits: LedgerLimits = {
  totalCapMicros: 50_000_000,
  stopMicros: 40_000_000,
  invocationCapMicros: 5_000_000,
};
const now = 1_000_000_000;

const hold = (id: string, invocation: string, micros: number, at = now): LedgerLine => ({
  v: 1,
  t: 'hold',
  id,
  invocation,
  micros,
  at,
});
const settle = (id: string, micros: number): LedgerLine => ({
  v: 1,
  t: 'settle',
  id,
  micros,
  at: now,
});
const release = (id: string): LedgerLine => ({ v: 1, t: 'release', id, at: now });

describe('the spend ledger decision', () => {
  it('RF-1402 lets a hold through when it stays within every cap', () => {
    const result = decideHold([hold('h1', 'inv-a', 1_000_000)], 'h1', limits, now);

    expect(result.ok).toBe(true);
  });

  it('RF-1402 refuses a hold that would pass the cap of the invocation', () => {
    const lines = [hold('h1', 'inv-a', 1), settle('h1', 4_000_000), hold('h2', 'inv-a', 1_500_000)];

    const result = decideHold(lines, 'h2', limits, now);

    expect(result.ok ? undefined : result.error.reason).toBe('invocation-cap');
  });

  it('RF-1402 refuses a hold that would pass the stop line of the phase and names it', () => {
    const lines = [
      hold('h1', 'inv-b', 1),
      settle('h1', 39_500_000),
      hold('h2', 'inv-a', 1_000_000),
    ];

    const result = decideHold(lines, 'h2', limits, now);

    expect(result.ok ? undefined : result.error.reason).toBe('stop-line');
    expect(result.ok ? '' : result.error.message).toContain('stop line');
  });

  it('RF-1402 refuses a hold that would pass the total cap once the owner has raised the stop line', () => {
    const raised = { ...limits, stopMicros: 50_000_000, invocationCapMicros: 50_000_000 };
    const lines = [
      hold('h1', 'inv-b', 1),
      settle('h1', 49_500_000),
      hold('h2', 'inv-a', 1_000_000),
    ];

    const result = decideHold(lines, 'h2', raised, now);

    expect(result.ok ? undefined : result.error.reason).toBe('phase-cap');
  });
});

describe('the spend ledger of two processes', () => {
  it('RF-1402 counts what another process holds, but only the holds written before its own', () => {
    const first = hold('h1', 'inv-b', 39_000_000);
    const second = hold('h2', 'inv-a', 1_500_000);

    const wide = { ...limits, invocationCapMicros: 40_000_000 };

    expect(decideHold([first, second], 'h2', wide, now).ok).toBe(false);
    expect(decideHold([first, second], 'h1', wide, now).ok).toBe(true);
  });

  it('RF-1402 stops counting a hold that was released and one older than the hold lifetime', () => {
    const lines = [
      hold('h1', 'inv-b', 39_000_000),
      release('h1'),
      hold('h3', 'inv-c', 39_000_000, now - HOLD_TTL_MS - 1),
      hold('h2', 'inv-a', 1_500_000),
    ];

    expect(decideHold(lines, 'h2', limits, now).ok).toBe(true);
  });

  it('RF-1402 totals what was spent and what is held', () => {
    const lines = [
      hold('h1', 'a', 900),
      settle('h1', 500),
      hold('h2', 'a', 300),
      hold('h3', 'b', 100),
      release('h3'),
    ];

    expect(ledgerTotals(lines, now)).toEqual({ spentMicros: 500, heldMicros: 300 });
  });

  it('RF-1402 keeps a hold for at least as long as the longest call can run: 30 minutes', () => {
    expect(HOLD_TTL_MS).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it('RF-1402 reads the lines of a file and ignores a torn or foreign line', () => {
    const text = [
      JSON.stringify(hold('h1', 'a', 5)),
      '{"v":1,"t":"hold","id":"h2"',
      'not json',
      JSON.stringify(settle('h1', 4)),
      '',
    ].join('\n');

    expect(parseLedgerText(text)).toEqual([hold('h1', 'a', 5), settle('h1', 4)]);
  });
});
