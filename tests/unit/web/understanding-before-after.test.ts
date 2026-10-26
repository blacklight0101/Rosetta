import { describe, expect, it } from 'vitest';
import {
  beforeAfterRows,
  stopText,
  type MeasureSet,
} from '../../../web/src/lib/understanding/measure-text.js';

// RF-231 scenario 2, RF-209: each measure before and after a Deepen, with "supported after a re-read"
// listed apart, and why the Deepen stopped, in words.

function measures(change: Partial<MeasureSet> = {}): MeasureSet {
  return {
    firstPartyCoverage: 0.4,
    firstPartyTokens: 1000,
    firstPartyReadTokens: 400,
    filesNotReadCount: 12,
    supported: 68,
    rejected: 40,
    supportedShare: 68 / 108,
    notJudged: 10,
    rejectedUnresolved: 40,
    supportedAfterReread: 0,
    thirdParty: { files: 0, tokens: 0, claims: 0 },
    wellCovered: false,
    ...change,
  };
}

const after = measures({
  ...{ firstPartyCoverage: 0.55, firstPartyReadTokens: 550, filesNotReadCount: 7 },
  ...{ supported: 90, rejected: 43, supportedShare: 90 / 133, notJudged: 0 },
  ...{ rejectedUnresolved: 21, supportedAfterReread: 19 },
});

function row(
  id: string,
  label: string,
  [before, after]: readonly [string, string],
  [kind, change]: readonly ['better' | 'worse' | 'same' | 'info', string],
) {
  return { id, label, before, after, kind, change };
}

describe('RF-231 each measure before and after a Deepen', () => {
  it('RF-231 shows every measure with its value before and after and its change', () => {
    expect(beforeAfterRows(measures(), after)).toEqual([
      row('coverage', 'First-party coverage', ['40%', '55%'], ['better', 'up 15 points']),
      row('notRead', 'First-party files not read', ['12', '7'], ['better', 'down 5']),
      row('supported', 'Supported claims', ['68', '90'], ['better', 'up 22']),
      row('rejected', 'Rejected claims', ['40', '43'], ['info', 'up 3']),
      row('notJudged', 'Not judged', ['10', '0'], ['better', 'down 10']),
      row('unresolved', 'Rejected, not replaced', ['40', '21'], ['better', 'down 19']),
      row('afterReread', 'Supported after a re-read', ['0', '19'], ['info', 'up 19, listed apart']),
    ]);
  });

  it('RF-231 marks a measure that got worse and one that did not change', () => {
    const rows = beforeAfterRows(
      measures(),
      measures({ firstPartyCoverage: 0.3, notJudged: 14, supported: 68 }),
    );

    expect(rows.find((row) => row.id === 'coverage')).toMatchObject({
      ...{ kind: 'worse', change: 'down 10 points' },
    });
    expect(rows.find((row) => row.id === 'notJudged')).toMatchObject({ kind: 'worse' });
    expect(rows.find((row) => row.id === 'supported')).toMatchObject({
      ...{ kind: 'same', change: 'no change' },
    });
  });

  it('RF-231 has a coverage of none when no first-party code was read', () => {
    const rows = beforeAfterRows(measures({ firstPartyCoverage: null }), after);

    expect(rows[0]).toMatchObject({ before: 'none read', after: '55%', kind: 'better' });
  });
});

describe('RF-209 why a Deepen stopped', () => {
  it.each([
    [
      'noProgress',
      'No progress: the last round added no new supported claim and read no new first-party file.',
    ],
    ['roundLimit', 'The round limit was reached: 2 of 3 rounds ran.'],
    ['capReached', 'A cap stopped it after 2 of 3 rounds. The run can be resumed.'],
    ['stopped', 'You stopped it after 2 of 3 rounds.'],
    [
      'readersStopped',
      'The readers stopped to leave room to judge the claims written, after 2 of 3 rounds.',
    ],
  ])('RF-209 words the reason %s', (reason, text) => {
    expect(stopText(reason, 2, 3)).toBe(text);
  });

  it('RF-209 does not pretend to know a reason it was not told', () => {
    expect(stopText('somethingNew', 2, 3)).toBe('It stopped after 2 of 3 rounds.');
  });
});
