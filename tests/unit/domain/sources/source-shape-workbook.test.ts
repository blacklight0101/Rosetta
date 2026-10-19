import { describe, expect, it } from 'vitest';
import { hasValidSourceShape } from '../../../../src/domain/sources/source-shape.js';

// RF-152, RFC-005 section 4.1: a workbook project has no address, ref or subpath, as an upload.

const empty = { sourceUrl: '', ref: '', subpath: '' };

describe('hasValidSourceShape for a workbook project', () => {
  it('RF-152 accepts empty source_url, ref and subpath', () => {
    expect(hasValidSourceShape('workbook', empty)).toBe(true);
  });

  it.each([
    ['a source address', { ...empty, sourceUrl: 'https://github.com/o/r' }],
    ['a ref', { ...empty, ref: 'main' }],
    ['a subpath', { ...empty, subpath: 'src' }],
  ])('RF-152 refuses a workbook project that holds %s', (_what, source) => {
    expect(hasValidSourceShape('workbook', source)).toBe(false);
  });
});
