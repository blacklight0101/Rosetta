import type { DeepenEstimate } from '../../api/understanding.js';
import { dollars, isLocalModel, tokensText } from '../estimate-math.js';
import { countText } from './measure-text.js';

// RF-209, RF-425, ADR-007, DEC-145: the words for the estimate of a Deepen. The first round is planned
// from the completed run. The figure for all rounds is the first round times the round limit: a
// working ceiling, not a maximum, because a later round can need more than the first; the run cap is
// what stops the run. A role whose model has no price counts as zero in the figures, so the figures
// are then a lower bound and are worded "at least". With a local model (Ollama, Q-44) the figures are
// tokens and a warning is about a token cap only: it never reads "$0.00 could pass the run cap".

type Points = DeepenEstimate['round'];

const plural = (count: number, word: string): string =>
  `${countText(count)} ${word}${count === 1 ? '' : 's'}`;

function lowerBound(estimate: DeepenEstimate): string {
  return estimate.roles.some((role) => !role.priced) ? 'at least ' : '';
}

const isLocal = (estimate: DeepenEstimate): boolean =>
  estimate.roles.length > 0 && estimate.roles.every((role) => isLocalModel(role.kind));

const tokensOf = (point: Points['high']): number => point.inputTokens + point.outputTokens;

function costs(points: Points, estimate: DeepenEstimate): string {
  const some = lowerBound(estimate);
  const local = isLocal(estimate);
  const of = (scenario: keyof Points): string =>
    local
      ? tokensText(tokensOf(points[scenario]))
      : `${some}${dollars(BigInt(points[scenario].costMicros))}`;
  return `likely ${of('likely')} (low ${of('low')}, high ${of('high')})`;
}

const microsOf = (cap: DeepenEstimate['cap']): string => dollars(BigInt(cap.maxCostMicros));

function stopsAt(estimate: DeepenEstimate): string {
  const { cap } = estimate;
  if (isLocal(estimate)) {
    return `The run cap of ${tokensText(cap.maxTokens)} is what stops the run (a local model costs nothing).`;
  }
  return `The run cap of ${microsOf(cap)} is what stops the run (it also stops at ${tokensText(cap.maxTokens)}).`;
}

// RF-209
export function firstRoundText(estimate: DeepenEstimate): string {
  const { plan } = estimate;
  const reads =
    plan.unreadFiles === 0
      ? ''
      : ` and reads ${plural(plan.unreadFiles, 'first-party file')} never read (${countText(plan.unreadTokens)} tokens)`;
  const apart =
    plan.outOfScope === 0
      ? ''
      : ` ${plural(plan.outOfScope, 'rejected claim')} cite only third-party or generated code and are left out of scope.`;
  return (
    `First round: ${costs(estimate.round, estimate)}. It judges ${plural(plan.judge, 'claim')}, ` +
    `re-reads ${plural(plan.reread, 'rejected claim')}${reads}.${apart}`
  );
}

// RF-209
export function allRoundsText(estimate: DeepenEstimate): string {
  return (
    `Up to ${plural(estimate.maxRounds, 'round')}: ${costs(estimate.allRounds, estimate)}. ` +
    'This is a working ceiling, not a maximum: a later round can need more than the first. ' +
    stopsAt(estimate)
  );
}

const STOPS = 'The run stops cleanly at the cap and can be resumed.';

/**
 * The warning for one flagged figure, in the unit of the cap it could pass: tokens for the token
 * cap, dollars for the cost cap. A local model has no cost, so only its tokens can warn.
 */
function warningOf(what: string, points: Points, estimate: DeepenEstimate): readonly string[] {
  const { cap } = estimate;
  const tokensOver = tokensOf(points.high) > cap.maxTokens;
  const costOver = BigInt(points.high.costMicros) > BigInt(cap.maxCostMicros);
  const intro = `The high figure for ${what}`;
  const tokens = tokensText(tokensOf(points.high));
  const byTokens = `${intro} (${tokens}) could pass the run token cap (${tokensText(cap.maxTokens)}). ${STOPS}`;
  if (isLocal(estimate)) return tokensOver ? [byTokens] : [];
  if (tokensOver && !costOver) return [byTokens];
  const money = dollars(BigInt(points.high.costMicros));
  return [`${intro} (${money}) could pass the run cap (${microsOf(cap)}). ${STOPS}`];
}

// RF-427
export function overCapTexts(estimate: DeepenEstimate): readonly string[] {
  const { overCap } = estimate;
  return [
    ...(overCap.round ? warningOf('the first round', estimate.round, estimate) : []),
    ...(overCap.allRounds ? warningOf('all rounds', estimate.allRounds, estimate) : []),
  ];
}
