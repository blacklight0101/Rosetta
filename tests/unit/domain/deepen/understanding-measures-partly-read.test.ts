import { describe, expect, it } from 'vitest';
import { understandingMeasures } from '../../../../src/domain/deepen/understanding-measures.js';
import { entry } from '../../../support/code-map-builders.js';
import { coverageOf } from '../../../support/deepen-fixtures.js';

// RF-231, RF-230, EV-04: a file read in part is not read; its unread ranges and share are listed.

const files = [entry('src/big.cs', 1000), entry('src/small.cs', 100)];

function measured(bigRead: number, smallRead: number) {
  const coverage = coverageOf('src', [
    { path: 'src/big.cs', read: bigRead },
    { path: 'src/small.cs', read: smallRead },
  ]);
  return understandingMeasures({ cards: [], coverage: [coverage], files });
}

describe('understandingMeasures partly read files', () => {
  it('RF-231 lists a file read to 6.7% with its unread ranges and its unread share', () => {
    const measures = measured(67, 100);

    expect(measures.filesNotRead).toEqual([
      {
        path: 'src/big.cs',
        tokens: 933,
        unreadShare: 0.933,
        unreadRanges: [{ startLine: 68, endLine: 1000 }],
      },
    ]);
  });

  it('RF-231 does not list a file read from its first line to its last', () => {
    expect(measured(1000, 100).filesNotRead).toEqual([]);
  });

  it('RF-231 lists a file no task read with no ranges, as before', () => {
    expect(measured(0, 100).filesNotRead).toEqual([{ path: 'src/big.cs', tokens: 1000 }]);
  });

  it('RF-231 sorts partly read and unread files together by the tokens left unread', () => {
    expect(measured(67, 0).filesNotRead.map((file) => file.path)).toEqual([
      'src/big.cs',
      'src/small.cs',
    ]);
    expect(measured(990, 0).filesNotRead.map((file) => file.path)).toEqual([
      'src/small.cs',
      'src/big.cs',
    ]);
  });
});
