import { describe, expect, it } from 'vitest';
import { understandingView } from '../../../../src/presentation/web/understanding-view.js';
import type { UnderstandingMeasures } from '../../../../src/domain/deepen/understanding-measures.js';

// RF-231: what the API shows of the measures of a run. The files not read are the largest first and
// at most ten are listed, with the count of all, so a large application does not make a large answer.

function measures(unread: number): UnderstandingMeasures {
  return {
    firstPartyCoverage: 0.5,
    firstPartyTokens: 1000,
    firstPartyReadTokens: 500,
    filesNotRead: Array.from({ length: unread }, (_, index) => ({
      path: `src/file-${String(index)}.cs`,
      tokens: 100 - index,
    })),
    supported: 3,
    rejected: 1,
    supportedShare: 0.75,
    notJudged: 0,
    rejectedUnresolved: 1,
    supportedAfterReread: 0,
    thirdParty: { files: 1, tokens: 20, claims: 0 },
    wellCovered: false,
  };
}

describe('RF-231 the view of the measures of a run', () => {
  it('RF-231 lists at most ten files not read and counts all of them', () => {
    const view = understandingView({ measures: measures(14), deepen: null });

    expect(view.measures?.filesNotRead).toHaveLength(10);
    expect(view.measures?.filesNotRead[0]).toEqual({ path: 'src/file-0.cs', tokens: 100 });
    expect(view.measures?.filesNotReadCount).toBe(14);
  });

  it('RF-231 keeps the unread share of a partly read file and leaves its line ranges out', () => {
    const base = measures(1);
    const partly = {
      path: 'src/big.cs',
      tokens: 933,
      unreadShare: 0.933,
      unreadRanges: [{ startLine: 68, endLine: 1000 }],
    };

    const view = understandingView({ measures: { ...base, filesNotRead: [partly] }, deepen: null });

    expect(view.measures?.filesNotRead).toEqual([
      { path: 'src/big.cs', tokens: 933, unreadShare: 0.933 },
    ]);
  });

  it('RF-231 keeps every other measure as it is', () => {
    const view = understandingView({ measures: measures(2), deepen: null });

    expect(view.measures).toMatchObject({
      ...{ firstPartyCoverage: 0.5, supported: 3, rejected: 1, supportedShare: 0.75 },
      ...{ thirdParty: { files: 1, tokens: 20, claims: 0 }, wellCovered: false },
      filesNotReadCount: 2,
    });
  });

  it('RF-231 gives null for a run without measures and the Deepen record as it is', () => {
    expect(understandingView({ measures: null, deepen: null })).toEqual({
      measures: null,
      deepen: null,
    });
  });
});
