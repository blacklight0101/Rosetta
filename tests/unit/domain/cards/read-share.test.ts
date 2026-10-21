import { describe, expect, it } from 'vitest';
import { readShare } from '../../../../src/domain/cards/read-share.js';
import { entry } from '../../../support/code-map-builders.js';

// Q-50, RF-206, RF-231: the share of an area's first-party tokens read so far and the files still
// unread, in the order worth reading them.

const files = [
  entry('wb/workbook.md', 100),
  entry('wb/A/values.md', 400),
  entry('wb/A/formulas.md', 200),
  entry('wb/B/formulas.md', 300),
  entry('wb/macros/Module1.bas', 50),
  entry('src/Big.cs', 150),
];

describe('readShare', () => {
  it('Q-50 counts the tokens of the lines read over the first-party tokens of the area', () => {
    const share = readShare(files, [{ path: 'wb/A/values.md', startLine: 1, endLine: 200 }]);

    expect(share.tokens).toBe(1200);
    expect(share.readTokens).toBe(200);
    expect(share.share).toBeCloseTo(1 / 6);
  });

  it('Q-50 ranks formulas, then macros, then the largest unread file first', () => {
    const share = readShare(files, [{ path: 'wb/workbook.md', startLine: 1, endLine: 100 }]);

    expect(share.unread.map((file) => file.path)).toEqual([
      'wb/B/formulas.md',
      'wb/A/formulas.md',
      'wb/macros/Module1.bas',
      'wb/A/values.md',
      'src/Big.cs',
    ]);
  });

  it('RF-231 leaves third-party and skipped files out of the share and the list', () => {
    const library = [
      entry('src/App.cs', 100),
      entry('Scripts/jquery-3.4.1.min.js', 9000),
      entry('logo.png', 0, { skipped: 'binary', lines: 0 }),
    ];

    const share = readShare(library, [{ path: 'src/App.cs', startLine: 1, endLine: 100 }]);

    expect(share).toMatchObject({ tokens: 100, readTokens: 100, share: 1, unread: [] });
  });

  it('Q-50 has nothing to read in an area without first-party tokens', () => {
    expect(readShare([], []).share).toBe(1);
  });
});
