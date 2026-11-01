import type { JourneyEstimate, RunEstimate } from '../api/estimate-schemas.js';
import { dollars, isLocalEstimate, tokensText } from './estimate-math.js';

// RF-430, RF-431, DEC-196: the journey total the user approves on the start button, and the roles
// whose key is missing. The likely total is the approved amount the run records (P7-05 pauses near
// it); the worst case is stated beside it.

/** The amount the start request records as the run's approved amount. */
export interface ApprovedAmount {
  readonly tokens: number;
  readonly costMicros: number;
}

// RF-430
export function approvedAmountOf(estimate: RunEstimate): ApprovedAmount | undefined {
  const { journey } = estimate;
  if (journey === undefined) return undefined;
  return { tokens: journey.likely.tokens, costMicros: Number(journey.likely.costMicros) };
}

function figureText(estimate: RunEstimate, figure: JourneyEstimate['likely']): string {
  return isLocalEstimate(estimate) ? tokensText(figure.tokens) : dollars(BigInt(figure.costMicros));
}

/** `$1.20` or `2,600,000 tokens`: the figure the start button names. */
// RF-430
export function approvalText(estimate: RunEstimate): string | undefined {
  const { journey } = estimate;
  return journey === undefined ? undefined : figureText(estimate, journey.likely);
}

/** The worst case of the journey, in the unit of the approved figure. */
export function worstCaseText(estimate: RunEstimate): string | undefined {
  const { journey } = estimate;
  return journey === undefined ? undefined : figureText(estimate, journey.worstCase);
}

/** RF-431: the providers of the roles that have no usable key, without repeats. */
export function missingKeyProviders(estimate: Pick<RunEstimate, 'roles'>): readonly string[] {
  const missing = estimate.roles.filter((role) => role.keyMissing === true);
  return [...new Set(missing.map((role) => role.provider))];
}
