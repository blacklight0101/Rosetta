import { describe, expect, it } from 'vitest';
import { areaCoverage } from '../../../../src/domain/cards/area-coverage.js';
import { unionCoverage } from '../../../../src/domain/cards/coverage-union.js';
import { areaCoverageWithShare } from '../../../../src/domain/cards/read-share.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-230, RF-231 (P8-93): the share of an area that is read counts first-party files only, the
// number the summary and the reader gate already use (`readShare`); a vendored or minified file the
// readers never open must not keep an own area "partly read".

const own = entry('Catalog/Item.cs', 100);
const library = entry('Catalog/Scripts/jquery-3.4.1.min.js', 900);
const files = [own, library];
const area = {
  name: 'Catalog',
  files: files.map((file) => file.path),
  estimatedTokens: 1000,
};
const readOwn = [{ path: own.path, startLine: 1, endLine: 100 }];

describe('areaCoverageWithShare', () => {
  it('RF-231 shares the first-party tokens read, not those of vendored files the readers never open', () => {
    const coverage = areaCoverageWithShare(area, files, readOwn);

    expect(areaCoverage(area, files, readOwn).readTokenShare).toBe(0.1);
    expect(coverage.firstPartyShare).toBe(1);
  });

  it('RF-230 an own area read 16% is 0.16 of its first-party tokens whatever the vendored files weigh', () => {
    const coverage = areaCoverageWithShare(area, files, [
      { path: own.path, startLine: 1, endLine: 16 },
    ]);

    expect(coverage.firstPartyShare).toBe(0.16);
  });

  it('RF-230 an area no reader started has the share 0, and an area of library files only has nothing to read', () => {
    expect(areaCoverageWithShare(area, files, []).firstPartyShare).toBe(0);
    const only = { name: 'Lib', files: [library.path], estimatedTokens: 900 };

    expect(areaCoverageWithShare(only, [library], []).firstPartyShare).toBe(1);
  });

  it('RF-230 keeps the share when a Deepen unites the reads of several tasks', () => {
    const first = areaCoverageWithShare(area, files, [
      { path: own.path, startLine: 1, endLine: 10 },
    ]);
    const second = areaCoverageWithShare(area, files, [
      { path: own.path, startLine: 11, endLine: 50 },
    ]);

    const [union] = unionCoverage([first, second], [area], files);

    expect(union?.firstPartyShare).toBe(0.5);
  });
});
