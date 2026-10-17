import { ratio } from './ratio.js';

// RF-305, DEC-57: how far the verifier agrees with claims labelled by hand as supported or not. A
// verdict agrees when it equals the label. A claim the verifier left `Unverified` (an answer that
// could not be read, a call that failed, a cap) has no verdict: it never agrees and is counted as
// not judged, so a verifier that cannot answer does not look good. The two ways to be wrong are
// counted apart: calling a claim `Supported` against its label is the error that lets a false
// statement through; rejecting a supported claim only costs a second look.

export type CalibrationLabel = 'Supported' | 'Rejected';
export type CalibrationVerdict = 'Supported' | 'Rejected' | 'Unverified';

export interface CalibrationOutcome {
  readonly claimId: string;
  /** The hand label: `Supported`, or `Rejected` for a claim the cited lines do not support. */
  readonly label: CalibrationLabel;
  readonly verdict: CalibrationVerdict;
  /** The verifier's one-line reason, or why the claim was left unjudged. */
  readonly reason: string;
}

export interface Agreement {
  readonly claims: number;
  readonly agreed: number;
  /** `agreed / claims` to six decimals; null without claims. */
  readonly rate: number | null;
  /** Called `Supported` although the label says it is not. */
  readonly falseSupported: number;
  /** Called `Rejected` although the label says it is supported. */
  readonly falseRejected: number;
  /** Left `Unverified`: no verdict. */
  readonly unjudged: number;
  /** In claim order. */
  readonly disagreements: readonly CalibrationOutcome[];
}

// RF-305
export function measureAgreement(outcomes: readonly CalibrationOutcome[]): Agreement {
  const disagreements = outcomes.filter((outcome) => outcome.verdict !== outcome.label);
  const agreed = outcomes.length - disagreements.length;
  const count = (test: (outcome: CalibrationOutcome) => boolean): number =>
    disagreements.filter(test).length;
  return {
    claims: outcomes.length,
    agreed,
    rate: ratio(agreed, outcomes.length),
    falseSupported: count((o) => o.verdict === 'Supported'),
    falseRejected: count((o) => o.verdict === 'Rejected'),
    unjudged: count((o) => o.verdict === 'Unverified'),
    disagreements,
  };
}
