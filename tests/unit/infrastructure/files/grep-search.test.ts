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

  it('RF-146 stops one match past the cap, so the caller can tell the matches were cut', () => {
    expect(searchFiles({ pattern: 'place', files, maxMatches: 1 })).toEqual({
      kind: 'matches',
      matches: [
        { path: 'a.ts', line: 2 },
        { path: 'b.ts', line: 1 },
      ],
    });
  });

  it('RF-146 stops reading further files once it is one match past the cap', () => {
    const read: string[] = [];
    const watched = (path: string, lines: readonly string[]) => ({
      path,
      get lines(): readonly string[] {
        read.push(path);
        return lines;
      },
    });
    const many = [
      watched('a.ts', ['hit', 'hit']),
      watched('b.ts', ['hit', 'hit']),
      watched('c.ts', ['hit']),
    ];

    const outcome = searchFiles({ pattern: 'hit', files: many, maxMatches: 2 });

    expect(outcome.kind === 'matches' && outcome.matches).toHaveLength(3);
    expect(read).toEqual(['a.ts', 'b.ts']);
  });
});
describe('grep search errors', () => {
  it('RF-146 reports a pattern that is not a regular expression instead of throwing', () => {
    const outcome = searchFiles({ pattern: '(unclosed', files });

    expect(outcome.kind).toBe('invalid-pattern');
    expect(outcome.kind === 'invalid-pattern' && outcome.detail).toContain('(unclosed');
  });
});
