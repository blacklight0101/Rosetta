import type { JourneyEstimate, RunEstimate } from '../api/estimate-schemas.js';
import { dollars, isLocalEstimate, tokensText } from './estimate-math.js';

// RF-430, RF-431, DEC-196: the journey total the user approves on the start button, and the roles
// whose key is missing. DEC-206: the approved amount the run records and pauses at is the lower of
// the worst case and the administrator ceilings (replacing DEC-205's worst case); the likely total
// is stated beside it.

/** The amount the start request records as the run's approved amount. */
export interface ApprovedAmount {
  readonly tokens: number;
  readonly costMicros: number;
}

// RF-430
export function approvedAmountOf(estimate: RunEstimate): ApprovedAmount | undefined {
  const { journey } = estimate;
  if (journey === undefined) return undefined;
  // DEC-206: the run is approved at the lower of the worst case and the ceilings (RF-432).
  const { approvable } = journey;
  return { tokens: approvable.tokens, costMicros: Number(approvable.costMicros) };
}

function figureText(estimate: RunEstimate, figure: JourneyEstimate['likely']): string {
  return isLocalEstimate(estimate) ? tokensText(figure.tokens) : dollars(BigInt(figure.costMicros));
}

/** `$1.20` or `2,600,000 tokens`: the figure the start button names. */
// RF-430
export function approvalText(estimate: RunEstimate): string | undefined {
  const { journey } = estimate;
  return journey === undefined ? undefined : figureText(estimate, journey.approvable);
}

/** The likely journey total, stated beside the approved figure. */
export function likelyText(estimate: RunEstimate): string | undefined {
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

/** DEC-206: says that a ceiling lowered the approvable figure; undefined when none did. */
export function ceilingNoteText(estimate: RunEstimate): string | undefined {
  const { journey } = estimate;
  if (journey?.ceilingApplied !== true) return undefined;
  const worst = worstCaseText(estimate);
  const approvable = approvalText(estimate);
  return `The worst case of ${worst ?? ''} is above what a run can reach under the administrator ceilings, so you approve ${approvable ?? ''}.`;
}

/** DEC-206, RST-2310: says why the figure moved when the basis of the estimate changed. */
export function basisMovedText(before: RunEstimate, after: RunEstimate): string | undefined {
  const [was, now] = [before.journey?.basis, after.journey?.basis];
  if (was === undefined || now === undefined || was === now) return undefined;
  return now === 'history'
    ? 'The figures changed: they now come from the measured totals of earlier runs of this model, not from the fixed assumptions.'
    : 'The figures changed: they now come from the fixed assumptions, because no earlier run of this model is counted.';
}

/** DEC-210: says so when the likely total is above the approvable one; undefined when it is not. */
// RF-434
function likelyAboveText(estimate: RunEstimate): string | undefined {
  const { journey } = estimate;
  if (journey === undefined) return undefined;
  const local = isLocalEstimate(estimate);
  const above = local
    ? journey.likely.tokens > journey.approvable.tokens
    : BigInt(journey.likely.costMicros) > BigInt(journey.approvable.costMicros);
  return above
    ? `likely above what can be approved (likely ${figureText(estimate, journey.likely)})`
    : undefined;
}

/** The journey figures as three short lines, in the words of the Deepen panel (P8-26, RF-434). */
export interface EstimateLines {
  readonly likely: string;
  readonly approved: string;
  readonly stops: string;
}

/**
 * RF-434, DEC-210, P8-26: the likely total, the amount Analyse approves and what stops the run.
 * When the likely total is above the approvable one, the likely line shows the approvable figure
 * with the DEC-210 words and the run is said to pause and ask at the approved amount.
 */
// RF-434
export function estimateLinesOf(estimate: RunEstimate): EstimateLines | undefined {
  const likely = likelyText(estimate);
  const approve = approvalText(estimate);
  if (likely === undefined || approve === undefined) return undefined;
  const above = likelyAboveText(estimate);
  return {
    likely: above === undefined ? likely : `${approve} (${above})`,
    approved: approve,
    stops:
      above === undefined
        ? 'the run pauses and asks before it goes past the approved amount'
        : 'the run will pause and ask at the approved amount',
  };
}
