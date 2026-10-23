import { describe, expect, it } from 'vitest';
import { unreadRanges } from '../../../../src/domain/cards/area-coverage.js';

// RF-230, RF-209, EV-04: the line ranges of a file that no task read.

describe('unreadRanges', () => {
  it('RF-230 returns the whole file when nothing was read', () => {
    expect(unreadRanges([], 10)).toEqual([{ startLine: 1, endLine: 10 }]);
  });

  it('RF-230 returns the lines before, between and after the lines read', () => {
    const read = [
      { startLine: 3, endLine: 4 },
      { startLine: 8, endLine: 9 },
    ];

    expect(unreadRanges(read, 12)).toEqual([
      { startLine: 1, endLine: 2 },
      { startLine: 5, endLine: 7 },
      { startLine: 10, endLine: 12 },
    ]);
  });

  it('RF-230 returns nothing for a file read from its first line to its last', () => {
    expect(unreadRanges([{ startLine: 1, endLine: 10 }], 10)).toEqual([]);
  });

  it('RF-230 cuts lines read past the end of the file', () => {
    expect(unreadRanges([{ startLine: 1, endLine: 99 }], 10)).toEqual([]);
  });
});
