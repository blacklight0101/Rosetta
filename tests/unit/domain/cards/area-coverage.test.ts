import { describe, expect, it } from 'vitest';
import { areaCoverage, type CoverageFile } from '../../../../src/domain/cards/area-coverage.js';

// RF-230: the coverage of one area from the lines its agent task read.

const file = (path: string, lines: number, estimatedTokens = lines): CoverageFile => ({
  path,
  lines,
  estimatedTokens,
});

const files = [file('src/a.cs', 100), file('src/b.cs', 100), file('src/c.cs', 0, 0)];
const area = { name: 'orders', files: ['src/a.cs', 'src/b.cs', 'src/c.cs'], estimatedTokens: 200 };

const read = (path: string, startLine: number, endLine: number) => ({ path, startLine, endLine });

describe('areaCoverage files', () => {
  it('RF-230 lists every file of the area as read with its line ranges or not read', () => {
    const coverage = areaCoverage(area, files, [read('src/a.cs', 10, 19)]);

    expect(coverage.area).toBe('orders');
    expect(coverage.files).toEqual([
      { path: 'src/a.cs', read: [{ startLine: 10, endLine: 19 }] },
      { path: 'src/b.cs', read: [] },
      { path: 'src/c.cs', read: [] },
    ]);
  });

  it('RF-230 merges overlapping and adjacent ranges, sorts them and cuts them to the file', () => {
    const reads = [
      read('src/a.cs', 50, 60),
      read('src/a.cs', 1, 10),
      read('src/a.cs', 11, 12),
      read('src/a.cs', 55, 70),
      read('src/a.cs', 95, 140),
    ];

    const coverage = areaCoverage(area, files, reads);

    expect(coverage.files[0]?.read).toEqual([
      { startLine: 1, endLine: 12 },
      { startLine: 50, endLine: 70 },
      { startLine: 95, endLine: 100 },
    ]);
  });

  it('RF-230 ignores reads of files outside the area and ranges past the end of a file', () => {
    const reads = [read('src/other.cs', 1, 5), read('src/b.cs', 101, 120)];

    const coverage = areaCoverage(area, files, reads);

    expect(coverage.files.map((each) => each.read)).toEqual([[], [], []]);
    expect(coverage.readTokens).toBe(0);
  });
});

describe('areaCoverage token share', () => {
  it('RF-230 counts the tokens of the lines read against the tokens of the area', () => {
    const coverage = areaCoverage(area, files, [read('src/a.cs', 1, 50), read('src/a.cs', 26, 50)]);

    expect(coverage.tokens).toBe(200);
    expect(coverage.readTokens).toBe(50);
    expect(coverage.readTokenShare).toBe(0.25);
  });

  it('RF-230 rounds the share to four decimals and reaches 1 when every line was read', () => {
    const thirds = areaCoverage(area, files, [read('src/a.cs', 1, 33)]);
    const whole = areaCoverage(area, files, [read('src/a.cs', 1, 100), read('src/b.cs', 1, 100)]);

    expect(thirds.readTokenShare).toBe(0.165);
    expect(whole.readTokenShare).toBe(1);
  });

  it('RF-230 an area without tokens has a share of 0', () => {
    const empty = { name: 'empty', files: ['src/c.cs'], estimatedTokens: 0 };

    const coverage = areaCoverage(empty, files, [read('src/c.cs', 1, 1)]);

    expect(coverage).toEqual({
      area: 'empty',
      files: [{ path: 'src/c.cs', read: [] }],
      tokens: 0,
      readTokens: 0,
      readTokenShare: 0,
    });
  });
});
