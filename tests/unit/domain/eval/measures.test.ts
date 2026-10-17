import { describe, expect, it } from 'vitest';
import { citationValidity } from '../../../../src/domain/eval/citation-validity.js';
import { estimateAccuracy } from '../../../../src/domain/eval/estimate-accuracy.js';
import { spreadOf } from '../../../../src/domain/eval/spread.js';
import { claim } from '../../../support/eval-fixtures.js';

// RNF-015: the spread of a measure across the repetitions of an evaluation; RNF-012: the actual
// cost of a run against its likely estimate; RFC-001 section 7: the citations of `Supported`
// claims that point at lines that exist.

describe('the spread across repetitions', () => {
  it('RNF-015 gives the count, smallest, largest, mean and standard deviation', () => {
    expect(spreadOf([0.5, 1, 0.75])).toEqual({
      n: 3,
      min: 0.5,
      max: 1,
      mean: 0.75,
      stdDev: 0.204124,
    });
  });

  it('RNF-015 leaves out repetitions that have no value, and has no spread without values', () => {
    expect(spreadOf([null, 2, null, 4])).toEqual({ n: 2, min: 2, max: 4, mean: 3, stdDev: 1 });
    expect(spreadOf([null, null])).toBeNull();
    expect(spreadOf([])).toBeNull();
  });

  it('RNF-015 gives a spread of zero for identical repetitions', () => {
    expect(spreadOf([0.9, 0.9, 0.9])).toMatchObject({ stdDev: 0, min: 0.9, max: 0.9 });
  });
});

describe('the estimate against the cost report', () => {
  it('RNF-012 measures the error of the likely estimate and whether it is within 30 percent', () => {
    expect(
      estimateAccuracy({ likelyMicros: 100_000, priced: true, actualMicros: 125_000 }),
    ).toEqual({
      status: 'measured',
      likelyMicros: 100_000,
      actualMicros: 125_000,
      error: 0.25,
      withinTarget: true,
    });
    expect(estimateAccuracy({ likelyMicros: 100_000, priced: true, actualMicros: 60_000 })).toEqual(
      {
        status: 'measured',
        likelyMicros: 100_000,
        actualMicros: 60_000,
        error: -0.4,
        withinTarget: false,
      },
    );
  });

  it('RNF-012 counts an error of exactly 30 percent as within the target', () => {
    const edge = estimateAccuracy({ likelyMicros: 100_000, priced: true, actualMicros: 130_000 });

    expect(edge).toMatchObject({ error: 0.3, withinTarget: true });
  });

  it('RNF-012 does not measure an unpriced model, a free run or a run without a cost report', () => {
    expect(estimateAccuracy({ likelyMicros: 5, priced: false, actualMicros: 5 })).toEqual({
      status: 'not-measured',
      reason: 'unpriced',
      likelyMicros: 5,
      actualMicros: 5,
    });
    expect(estimateAccuracy({ likelyMicros: 0, priced: true, actualMicros: 0 })).toMatchObject({
      status: 'not-measured',
      reason: 'free',
    });
    expect(estimateAccuracy({ likelyMicros: 10, priced: true, actualMicros: null })).toMatchObject({
      status: 'not-measured',
      reason: 'no-cost-report',
      actualMicros: null,
    });
  });
});

describe('the estimate against the cost report: edges', () => {
  it('RNF-012 compares the error before it is rounded, so just over 30 percent is not within', () => {
    const over = estimateAccuracy({
      likelyMicros: 10_000_000,
      priced: true,
      actualMicros: 13_000_001,
    });

    expect(over).toMatchObject({ error: 0.3, withinTarget: false });
  });

  it('RNF-012 calls a run free only when its estimate and its cost are both zero', () => {
    expect(estimateAccuracy({ likelyMicros: 0, priced: true, actualMicros: 500 })).toEqual({
      status: 'not-measured',
      reason: 'zero-estimate',
      likelyMicros: 0,
      actualMicros: 500,
    });
  });
});

describe('the citations of Supported claims', () => {
  const lines = new Map([
    ['Models/Item.cs', 62],
    ['Default.aspx.cs', 58],
  ]);

  it('RFC-001 counts the citations of Supported claims that point at existing lines', () => {
    const validity = citationValidity(
      [
        claim({ citations: ['Models/Item.cs:20-24', 'Default.aspx.cs:58-58'] }),
        claim({ citations: ['Models/Item.cs:60-63'] }),
        claim({ citations: ['Missing.cs:1-1'] }),
        claim({ citations: ['Models/Item.cs:900-901'], status: 'CitationInvalid' }),
      ],
      lines,
    );

    expect(validity).toEqual({
      checked: 4,
      valid: 2,
      rate: 0.5,
      invalid: ['Missing.cs:1-1', 'Models/Item.cs:60-63'],
    });
  });

  it('RFC-001 has no rate when no Supported claim cites anything', () => {
    expect(citationValidity([claim({ status: 'Rejected' })], lines)).toEqual({
      checked: 0,
      valid: 0,
      rate: null,
      invalid: [],
    });
  });
});
