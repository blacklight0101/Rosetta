import { describe, expect, it } from 'vitest';
import {
  measureAgreement,
  type CalibrationOutcome,
} from '../../../../src/domain/eval/verifier-agreement.js';

// RF-305, DEC-57: how far the verifier agrees with claims labelled by hand as supported or not.

function outcome(
  claimId: string,
  label: CalibrationOutcome['label'],
  verdict: CalibrationOutcome['verdict'],
): CalibrationOutcome {
  return { claimId, label, verdict, reason: `reason of ${claimId}` };
}

describe('measureAgreement', () => {
  it('RF-305 is the share of claims whose verdict equals the label', () => {
    const agreement = measureAgreement([
      outcome('a', 'Supported', 'Supported'),
      outcome('b', 'Rejected', 'Rejected'),
      outcome('c', 'Supported', 'Rejected'),
      outcome('d', 'Rejected', 'Supported'),
    ]);

    expect(agreement).toMatchObject({ claims: 4, agreed: 2, rate: 0.5 });
  });

  it('RF-305 lists the disagreements in claim order with the verifier reason', () => {
    const { disagreements } = measureAgreement([
      outcome('a', 'Supported', 'Supported'),
      outcome('b', 'Supported', 'Rejected'),
      outcome('c', 'Rejected', 'Rejected'),
      outcome('d', 'Rejected', 'Supported'),
    ]);

    expect(disagreements).toEqual([
      { claimId: 'b', label: 'Supported', verdict: 'Rejected', reason: 'reason of b' },
      { claimId: 'd', label: 'Rejected', verdict: 'Supported', reason: 'reason of d' },
    ]);
  });

  it('RF-305 counts a claim the verifier called Supported against the label apart, as the costly error', () => {
    const agreement = measureAgreement([
      outcome('a', 'Rejected', 'Supported'),
      outcome('b', 'Rejected', 'Supported'),
      outcome('c', 'Supported', 'Rejected'),
    ]);

    expect(agreement).toMatchObject({ falseSupported: 2, falseRejected: 1 });
  });
});

describe('measureAgreement and claims not judged', () => {
  it('RF-305 counts a claim left Unverified as a disagreement and as not judged', () => {
    const agreement = measureAgreement([
      outcome('a', 'Supported', 'Supported'),
      outcome('b', 'Supported', 'Unverified'),
      outcome('c', 'Rejected', 'Unverified'),
    ]);

    expect(agreement).toMatchObject({
      agreed: 1,
      unjudged: 2,
      falseSupported: 0,
      falseRejected: 0,
    });
    expect(agreement.rate).toBeCloseTo(1 / 3, 6);
    expect(agreement.disagreements.map((d) => d.claimId)).toEqual(['b', 'c']);
  });

  it('RF-305 rounds the rate to six decimals', () => {
    const agreement = measureAgreement([
      outcome('a', 'Supported', 'Supported'),
      outcome('b', 'Supported', 'Supported'),
      outcome('c', 'Supported', 'Rejected'),
    ]);

    expect(agreement.rate).toBe(0.666667);
  });

  it('RF-305 has no rate for no claims', () => {
    expect(measureAgreement([])).toMatchObject({ claims: 0, agreed: 0, rate: null });
  });
});
