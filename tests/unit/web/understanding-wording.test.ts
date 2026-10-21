import { describe, expect, it } from 'vitest';
import {
  measureRows,
  standingOf,
  type MeasureSet,
} from '../../../web/src/lib/understanding/measure-text.js';

// RF-231 scenario 3: the wording of the measures. The page never says "complete" or "fully
// understood", reports no 100% by claim, and says "well covered" only at 80% of the first-party
// tokens read or more with no claim left unjudged. A snapshot of the wording of a typical run, then
// a sweep over the thresholds.

function measures(change: Partial<MeasureSet> = {}): MeasureSet {
  return {
    firstPartyCoverage: 0.4231,
    firstPartyTokens: 28362,
    firstPartyReadTokens: 12000,
    filesNotReadCount: 12,
    supported: 68,
    rejected: 50,
    supportedShare: 68 / 118,
    notJudged: 3,
    rejectedUnresolved: 41,
    supportedAfterReread: 0,
    thirdParty: { files: 4, tokens: 12300, claims: 3 },
    wellCovered: false,
    ...change,
  };
}

const text = (set: MeasureSet): string =>
  [standingOf(set).text, ...measureRows(set).flatMap((row) => [row.label, row.value, row.detail])]
    .join('\n')
    .toLowerCase();

describe('RF-231 the wording of the measures', () => {
  it('RF-231 words a run that is not well covered', () => {
    expect(standingOf(measures()).text).toBe(
      'Not covered enough to say more: 42% of first-party tokens read, 3 claims not judged (the bar is 80% read and no claim left unjudged).',
    );
    expect(measureRows(measures())).toEqual([
      {
        ...{ id: 'coverage', label: 'First-party coverage', value: '42%' },
        detail: '12,000 of 28,362 first-party tokens read',
      },
      {
        ...{ id: 'notRead', label: 'First-party files not read', value: '12' },
        detail: 'files; the largest are listed below',
      },
      {
        ...{ id: 'share', label: 'Supported share', value: '68 of 118' },
        detail: '57% of the judged claims; 50 rejected',
      },
      { id: 'notJudged', label: 'Not judged', value: '3', detail: 'claims left Unverified' },
      {
        ...{ id: 'unresolved', label: 'Rejected, not replaced', value: '41' },
        detail: 'rejected claims with no supported replacement',
      },
      {
        ...{ id: 'thirdParty', label: 'Third-party and generated code', value: '4 files' },
        detail: '12,300 tokens and 3 claims, left out of every percentage',
      },
    ]);
  });
});

describe('RF-231 the wording of a well covered run', () => {
  it('RF-231 words a well covered run, with the supported-after-a-re-read count apart', () => {
    const set = measures({
      ...{ firstPartyCoverage: 0.8312, firstPartyReadTokens: 23575, notJudged: 0 },
      ...{ supportedAfterReread: 5, filesNotReadCount: 0, wellCovered: true },
    });

    expect(standingOf(set)).toEqual({
      wellCovered: true,
      text: 'Well covered: 83% of first-party tokens read and no claim left unjudged.',
    });
    const rows = measureRows(set);
    expect(rows.find((row) => row.id === 'afterReread')).toEqual({
      ...{ id: 'afterReread', label: 'Supported after a re-read', value: '5' },
      detail: 'listed apart; check these with more care',
    });
    expect(rows.find((row) => row.id === 'notRead')?.detail).toBe(
      'files; every first-party file was read',
    );
  });
});

describe('RF-231 the wording of edge cases', () => {
  it('RF-231 reports no percentage by claim when every judged claim was supported', () => {
    const rows = measureRows(measures({ supported: 12, rejected: 0, supportedShare: 1 }));

    expect(rows.find((row) => row.id === 'share')).toMatchObject({
      value: '12 of 12',
      detail: 'every judged claim was supported; the verifier can still be wrong',
    });
  });

  it('RF-231 says nothing is covered when no first-party code was read', () => {
    const set = measures({ firstPartyCoverage: null, firstPartyTokens: 0, supportedShare: null });

    expect(standingOf(set).text).toBe(
      'No first-party code was read, so there is nothing to call covered.',
    );
    expect(measureRows(set).find((row) => row.id === 'share')?.value).toBe('none judged');
  });

  it('RF-231 shows 79.96% as 79%, never rounded up to the bar', () => {
    const set = measures({ firstPartyCoverage: 0.7996, notJudged: 0, wellCovered: false });

    expect(standingOf(set).text).toContain('79% of first-party tokens read');
    expect(standingOf(set).wellCovered).toBe(false);
  });
});

describe('RF-231 the words never to use', () => {
  const coverages = [null, 0, 0.0004, 0.5, 0.7996, 0.8, 0.9999, 1];
  const unjudged = [0, 1, 7];

  it.each(coverages.flatMap((coverage) => unjudged.map((notJudged) => [coverage, notJudged])))(
    'RF-231 never says complete, and says well covered only at 80%% read with nothing unjudged (coverage %s, not judged %s)',
    (coverage, notJudged) => {
      const set = measures({
        firstPartyCoverage: coverage ?? null,
        notJudged: notJudged ?? 0,
        wellCovered: (coverage ?? 0) >= 0.8 && notJudged === 0,
      });

      const words = text(set);

      expect(words).not.toMatch(/complete|fully understood/u);
      expect(words.includes('well covered')).toBe((coverage ?? 0) >= 0.8 && notJudged === 0);
    },
  );

  it('RF-231 does not say well covered when the server says so but the numbers do not', () => {
    const set = measures({ wellCovered: true });

    expect(standingOf(set).wellCovered).toBe(false);
    expect(text(set)).not.toContain('well covered');
  });
});

describe('RF-231 percentages are cut down', () => {
  it('RF-231 never shows a read share above zero as 0%', () => {
    const set = measures({ firstPartyCoverage: 0.0004, notJudged: 0 });

    expect(standingOf(set).text).toContain('less than 1% of first-party tokens read');
    expect(measureRows(set)[0]?.value).toBe('less than 1%');
  });

  it('RF-231 works out well covered from the numbers, whatever the server flag says', () => {
    const set = measures({ firstPartyCoverage: 0.8, notJudged: 0, wellCovered: false });

    expect(standingOf(set).wellCovered).toBe(true);
    expect(standingOf(set).text).toBe(
      'Well covered: 80% of first-party tokens read and no claim left unjudged.',
    );
  });
});

describe('RF-231 (Q-44) a measure reads as a sentence and agrees in number', () => {
  const row = (set: MeasureSet, id: string) => {
    const found = measureRows(set).find((each) => each.id === id);
    if (found === undefined) throw new Error(`No row ${id}`);
    return `${found.value} ${found.detail}`;
  };

  it.each([
    [0, '0 claims left Unverified'],
    [1, '1 claim left Unverified'],
    [2, '2 claims left Unverified'],
    [1200, '1,200 claims left Unverified'],
  ])('RF-231 words %i claims not judged as "%s"', (count, expected) => {
    expect(row(measures({ notJudged: count }), 'notJudged')).toBe(expected);
  });

  it.each([
    [10, '10 files; the largest are listed below'],
    [1, '1 file; it is listed below'],
    [0, '0 files; every first-party file was read'],
  ])('RF-231 words %i first-party files not read as "%s"', (count, expected) => {
    expect(row(measures({ filesNotReadCount: count }), 'notRead')).toBe(expected);
  });
});
