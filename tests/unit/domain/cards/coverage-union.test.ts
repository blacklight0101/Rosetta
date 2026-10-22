import { describe, expect, it } from 'vitest';
import { unionCoverage } from '../../../../src/domain/cards/coverage-union.js';
import { coverageOf } from '../../../support/deepen-fixtures.js';

// RF-230, RF-209: one coverage row per area when a Deepen read an area again.

const files = [
  { path: 'src/a.cs', lines: 100, estimatedTokens: 100 },
  { path: 'src/b.cs', lines: 100, estimatedTokens: 300 },
  { path: 'web/x.ts', lines: 10, estimatedTokens: 10 },
];
const areas = [
  { name: 'src', files: ['src/a.cs', 'src/b.cs'], estimatedTokens: 400 },
  { name: 'web', files: ['web/x.ts'], estimatedTokens: 10 },
];

describe('unionCoverage', () => {
  it('RF-230 lists each area once with the lines every task read of its files', () => {
    const first = {
      ...coverageOf('src', [
        { path: 'src/a.cs', read: 10 },
        { path: 'src/b.cs', read: 0 },
      ]),
      note: 'kept',
    };
    const web = coverageOf('web', [{ path: 'web/x.ts', read: 0 }]);
    const again = coverageOf('src', [{ path: 'src/b.cs', read: 50 }]);

    const union = unionCoverage([first, web, again], areas, files);

    expect(union.map((each) => each.area)).toEqual(['src', 'web']);
    expect(union[0]?.files).toEqual([
      { path: 'src/a.cs', read: [{ startLine: 1, endLine: 10 }] },
      { path: 'src/b.cs', read: [{ startLine: 1, endLine: 50 }] },
    ]);
    expect(union[0]?.readTokens).toBe(160);
    expect(union[0]?.note).toBe('kept');
  });

  it('RF-230 counts the lines read of a file of the area by a task of another name', () => {
    const first = coverageOf('src', [{ path: 'src/a.cs', read: 0 }]);
    const reread = coverageOf('orders', [{ path: 'src/a.cs', read: 20 }]);

    const union = unionCoverage([first, reread], areas, files);

    expect(union.map((each) => each.area)).toEqual(['src']);
    expect(union[0]?.files[0]).toEqual({ path: 'src/a.cs', read: [{ startLine: 1, endLine: 20 }] });
  });
});

describe('unionCoverage failures', () => {
  it('RF-209 RST-1303 an area that failed and was read again without failing no longer says it failed', () => {
    const failed = {
      ...coverageOf('src', [{ path: 'src/a.cs', read: 10 }]),
      failure: 'failed (RST-1303)',
    };
    const again = coverageOf('src', [{ path: 'src/a.cs', read: 100 }]);

    const [row] = unionCoverage([failed, again], areas, files);

    expect(row?.failure).toBeUndefined();
  });

  it('RF-208 an area whose every task failed says why it failed', () => {
    const failed = {
      ...coverageOf('src', [{ path: 'src/a.cs', read: 10 }]),
      failure: 'failed (RST-1303)',
    };
    const again = { ...failed, failure: 'invalid output (RST-1300)' };

    const [row] = unionCoverage([failed, again], areas, files);

    expect(row?.failure).toBe('failed (RST-1303)');
  });
});
