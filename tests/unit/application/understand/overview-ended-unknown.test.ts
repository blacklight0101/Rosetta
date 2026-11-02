import { describe, expect, it } from 'vitest';
import { endedBefore } from '../../../../src/application/understand/overview-ended.js';
import { overviewOnlyOutcome } from '../../../../src/application/understand/session-outcome.js';
import { sampleManifest } from '../../../support/run-fixtures.js';

// RF-264, P8-12: a manifest without `overviewEnded` is unknown, not a cap with nothing counted.

const manifestWith = (options: Record<string, unknown>) => ({
  execution: { manifest: { ...sampleManifest(), options } },
});

describe('endedBefore', () => {
  it('P8-12 reads a manifest without the record as unknown, not as a cap with no counts', () => {
    expect(endedBefore(manifestWith({ cloudConsent: true }))).toBeUndefined();
  });

  it('P8-12 completes an unknown end when nothing is left, and caps it when claims are unjudged', () => {
    expect(overviewOnlyOutcome(undefined, { unjudged: 0 })).toEqual({ endState: 'Completed' });
    expect(overviewOnlyOutcome(undefined, { unjudged: 2 })).toMatchObject({
      endState: 'CapReached',
    });
  });
});
