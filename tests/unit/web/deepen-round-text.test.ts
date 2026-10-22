import { describe, expect, it } from 'vitest';
import { roundText } from '../../../web/src/lib/live-run/deepen-text.js';
import type { DeepenRoundState } from '../../../web/src/lib/live-run/run-state.js';

// RF-209, RF-231, RNF-010 (P3-62, owner test 2026-10-20): the line of each Deepen round says what it
// does in plain words, with the plural of every count right and no number standing alone.

const round = (changes: Partial<DeepenRoundState>): DeepenRoundState => ({
  ...{
    round: 1,
    status: 'done',
    judge: 0,
    reread: 0,
    outOfScope: 0,
    unreadFiles: 0,
    failedAreas: [],
  },
  ...{ newClaims: 0, newSupported: 0, filesRead: 0 },
  ...changes,
});

describe('RF-209 the line of a Deepen round', () => {
  it('RF-209 reads "1 file read" and "1 new claim" for a count of one', () => {
    const text = roundText(round({ newClaims: 1, newSupported: 1, filesRead: 1 }), 3);

    expect(text).toBe('Round 1 of 3, done: 1 new claim, 1 supported, 1 file read.');
  });

  it('RF-209 keeps the plural for zero and for many, with thousands separators', () => {
    const text = roundText(round({ newClaims: 0, newSupported: 0, filesRead: 1200 }), 3);

    expect(text).toBe('Round 1 of 3, done: 0 new claims, 0 supported, 1,200 files read.');
  });

  it('RF-209 names what a running round re-reads: the rejected claims', () => {
    const text = roundText(round({ status: 'running', judge: 10, reread: 60, unreadFiles: 12 }), 3);

    expect(text).toBe(
      'Round 1 of 3, running: judging 10 claims, re-reading 60 rejected claims, reading 12 unread files.',
    );
  });

  it('RF-209 uses the singular for one claim to judge, one to re-read and one file to read', () => {
    const text = roundText(round({ status: 'running', judge: 1, reread: 1, unreadFiles: 1 }), 2);

    expect(text).toBe(
      'Round 1 of 2, running: judging 1 claim, re-reading 1 rejected claim, reading 1 unread file.',
    );
  });

  it('RF-209 says "no unread files to read" instead of "0 unread files to read"', () => {
    const text = roundText(round({ status: 'running', judge: 10, reread: 60, unreadFiles: 0 }), 3);

    expect(text).toContain('no unread files to read.');
    expect(text).not.toMatch(/\b0 unread/u);
  });

  it('RF-209 says nothing is re-read when no claim was rejected', () => {
    const text = roundText(round({ status: 'running', judge: 3, reread: 0, unreadFiles: 2 }), 3);

    expect(text).toContain('no rejected claims to re-read');
  });

  it('RF-209 keeps the words for a round a cap or Stop cut short', () => {
    expect(roundText(round({ status: 'cut' }), 3)).toBe(
      'Round 1 of 3, cut short by a cap or by Stop.',
    );
  });
});

describe('EV-10 the failed areas of a Deepen round', () => {
  it('EV-10 names the failed areas a running round reads again', () => {
    const text = roundText(round({ status: 'running', failedAreas: ['Inventory#2', 'Report'] }), 3);

    expect(text).toContain('re-reading 2 failed areas (Inventory#2, Report)');
  });

  it('EV-10 says nothing of failed areas when the round has none', () => {
    expect(roundText(round({ status: 'running' }), 3)).not.toContain('failed');
  });
});
