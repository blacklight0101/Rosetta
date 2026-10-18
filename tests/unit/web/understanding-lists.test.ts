import { describe, expect, it } from 'vitest';
import {
  mayHaveMeasures,
  measureLine,
  type MeasureSet,
} from '../../../web/src/lib/understanding/measure-text.js';

// RF-231 scenario 1: which runs of a list can have measures beside them, and the one line they get.

const measures: MeasureSet = {
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
  thirdParty: { files: 0, tokens: 0, claims: 0 },
  wellCovered: false,
};

const run = { stage: 'understand', queueState: 'Ended', endState: 'Completed' };

describe('RF-231 which runs can have measures', () => {
  it.each(['Completed', 'CapReached', 'Interrupted'])(
    'RF-231 an understand run that ended %s',
    (endState) => {
      expect(mayHaveMeasures({ ...run, endState })).toBe(true);
    },
  );

  it.each([
    ['a scan', { stage: 'scan' }],
    ['a run in the queue', { queueState: 'Queued', endState: null }],
    ['a run that is working', { queueState: 'Running', endState: null }],
    ['a run that failed', { endState: 'Failed' }],
    ['a plan run', { stage: 'plan' }],
  ])('RF-231 not %s', (_name, change) => {
    expect(mayHaveMeasures({ ...run, ...change })).toBe(false);
  });
});

describe('RF-231 the line of a run in a list', () => {
  it('RF-231 says what was read, what was confirmed and what was not judged', () => {
    expect(measureLine(measures)).toBe(
      '42% of first-party tokens read · 68 of 118 judged claims supported · 3 not judged',
    );
  });

  it('RF-231 says so when no first-party code was read and no claim was judged', () => {
    const none = { ...measures, firstPartyCoverage: null, supported: 0, rejected: 0 };

    expect(measureLine(none)).toBe('no first-party code read · no claim judged · 3 not judged');
  });
});
