import { describe, expect, it } from 'vitest';
import { grepLimits } from '../../../../src/infrastructure/files/grep-limits.js';
import { runGrep } from '../../../../src/infrastructure/files/grep-runner.js';

// RF-146, P1-119: the worker stops one match past the cap, so a pattern that matches every line of
// many files costs no more than the cap and the caller can still tell the list was cut.

function rows(count: number): string[] {
  return Array.from({ length: count }, () => 'row');
}

describe('grep runner', () => {
  it('RF-146 stops at one match past the cap and never reads the files after it', async () => {
    const files = [
      { path: 'a.txt', lines: rows(600) },
      { path: 'b.txt', lines: rows(600) },
      { path: 'c.txt', lines: rows(600) },
    ];

    const outcome = await runGrep('row', files, 10_000);

    expect(outcome.kind).toBe('matches');
    const matches = outcome.kind === 'matches' ? outcome.matches : [];
    expect(matches).toHaveLength(grepLimits.maxMatches + 1);
    expect(matches.at(-1)).toEqual({ path: 'b.txt', line: 401 });
    expect(matches.some((match) => match.path === 'c.txt')).toBe(false);
  });
});
