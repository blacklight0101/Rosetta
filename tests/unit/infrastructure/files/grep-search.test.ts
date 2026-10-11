import { describe, expect, it } from 'vitest';
import { searchFiles } from '../../../../src/infrastructure/files/grep-search.js';

const files = [
  { path: 'a.ts', lines: ['const x = 1;', 'function placeOrder() {}'] },
  { path: 'b.ts', lines: ['placeOrder()', 'nothing', 'placeOrder again'] },
];

describe('grep search', () => {
  it('RF-146 returns every matching line with its 1-based number, file by file', () => {
    expect(searchFiles({ pattern: 'place[A-Z]', files })).toEqual({
      kind: 'matches',
      matches: [
        { path: 'a.ts', line: 2 },
        { path: 'b.ts', line: 1 },
        { path: 'b.ts', line: 3 },
      ],
    });
  });

  it('RF-146 returns no matches when nothing matches', () => {
    expect(searchFiles({ pattern: 'absent', files })).toEqual({ kind: 'matches', matches: [] });
  });

  it('RF-146 reports a pattern that is not a regular expression instead of throwing', () => {
    const outcome = searchFiles({ pattern: '(unclosed', files });

    expect(outcome.kind).toBe('invalid-pattern');
    expect(outcome.kind === 'invalid-pattern' && outcome.detail).toContain('(unclosed');
  });
});
