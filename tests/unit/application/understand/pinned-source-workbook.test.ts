import { describe, expect, it } from 'vitest';
import { pinnedSourceOf } from '../../../../src/application/understand/pinned-source.js';

// RF-152, RF-156: a workbook has no commit; its citations link to the evidence pages of the report,
// as the citations of an uploaded zip do.

describe('RF-152 pinned source of a workbook project', () => {
  it('RF-152 is read as an upload: no commit, the citations link to the report', () => {
    const source = { kind: 'workbook', owner: '', repo: '' };

    expect(pinnedSourceOf(source, null)).toEqual({ kind: 'upload' });
  });

  it('RF-152 ignores a commit the scan recorded', () => {
    const source = { kind: 'workbook', owner: '', repo: '' };

    expect(pinnedSourceOf(source, 'ab'.repeat(20))).toEqual({ kind: 'upload' });
  });
});
