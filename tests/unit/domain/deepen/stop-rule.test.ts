import { describe, expect, it } from 'vitest';
import {
  DEEPEN_ROUNDS,
  isAllowedRoundLimit,
  roundProgress,
  stopAfterRound,
} from '../../../../src/domain/deepen/stop-rule.js';

// RF-209, DEC-145 (Q-H): the stop rule of a Deepen.

describe('stopAfterRound', () => {
  it('RF-209 ends with no progress after a round that added no Supported claim and read no new file', () => {
    expect(stopAfterRound({ newSupported: 0, newFilesRead: 0 }, 1, 3)).toBe('noProgress');
  });

  it.each([
    ['a new Supported claim', { newSupported: 1, newFilesRead: 0 }],
    ['a newly read file', { newSupported: 0, newFilesRead: 1 }],
  ])('RF-209 goes on after a round with %s while rounds are left', (_name, progress) => {
    expect(stopAfterRound(progress, 1, 3)).toBeUndefined();
  });

  it('RF-209 ends at the round limit after a round with progress', () => {
    expect(stopAfterRound({ newSupported: 2, newFilesRead: 1 }, 3, 3)).toBe('roundLimit');
  });

  it('RF-209 names no progress first when the last allowed round added nothing', () => {
    expect(stopAfterRound({ newSupported: 0, newFilesRead: 0 }, 3, 3)).toBe('noProgress');
  });
});

describe('roundProgress', () => {
  it('RF-209 counts only the claims and files that are new after the round', () => {
    const before = { supported: new Set(['a', 'b']), filesRead: new Set(['x.cs']) };
    const after = {
      supported: new Set(['a', 'b', 'c']),
      filesRead: new Set(['x.cs', 'y.cs', 'z.cs']),
    };

    expect(roundProgress(before, after)).toEqual({ newSupported: 1, newFilesRead: 2 });
  });
});

describe('round limit', () => {
  it('RF-209 defaults to 3 rounds', () => {
    expect(DEEPEN_ROUNDS.default).toBe(3);
  });

  it.each([1, 3, 5])('RF-209 allows a limit of %i rounds', (rounds) => {
    expect(isAllowedRoundLimit(rounds)).toBe(true);
  });

  it.each([0, 6, 2.5, -1])('RF-209 refuses a limit of %d rounds', (rounds) => {
    expect(isAllowedRoundLimit(rounds)).toBe(false);
  });
});
