import { describe, expect, it } from 'vitest';
import { SOURCE_KINDS, sourceKindOf } from '../../../../src/domain/sources/source-kind.js';

// RF-130, RFC-004 section 4.1: a source is a GitHub repository or an uploaded zip; a record that
// does not say which is a GitHub one.

describe('source kinds', () => {
  it('RF-130 the kinds are github and upload, in that order', () => {
    expect(SOURCE_KINDS).toEqual(['github', 'upload']);
  });

  it('RF-130 a record without a kind is a GitHub one', () => {
    expect(sourceKindOf({})).toBe('github');
    expect(sourceKindOf({ kind: undefined })).toBe('github');
  });

  it('RF-130 a record names its kind', () => {
    expect(sourceKindOf({ kind: 'upload' })).toBe('upload');
    expect(sourceKindOf({ kind: 'github' })).toBe('github');
  });
});
