// RF-305, DEC-57: stub, filled in by the next commit.

export type CalibrationLabel = 'Supported' | 'Rejected';
export type CalibrationVerdict = 'Supported' | 'Rejected' | 'Unverified';

export interface CalibrationOutcome {
  readonly claimId: string;
  readonly label: CalibrationLabel;
  readonly verdict: CalibrationVerdict;
  readonly reason: string;
}

export interface Agreement {
  readonly claims: number;
  readonly agreed: number;
  readonly rate: number | null;
  readonly falseSupported: number;
  readonly falseRejected: number;
  readonly unjudged: number;
  readonly disagreements: readonly CalibrationOutcome[];
}

export function measureAgreement(outcomes: readonly CalibrationOutcome[]): Agreement {
  return {
    claims: outcomes.length,
    agreed: 0,
    rate: null,
    falseSupported: 0,
    falseRejected: 0,
    unjudged: 0,
    disagreements: [],
  };
}
