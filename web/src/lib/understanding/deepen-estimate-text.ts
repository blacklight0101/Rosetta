import type { DeepenEstimate } from '../../api/understanding.js';
import { dollars } from '../estimate-math.js';
import { countText } from './measure-text.js';

// RF-209, RF-425, ADR-007, DEC-145: the words for the estimate of a Deepen. The first round is planned
// from the completed run. The figure for all rounds is the first round times the round limit: a
// working ceiling, not a maximum, because a later round can need more than the first; the run cap is
// what stops the run. A role whose model has no price counts as zero in the figures, so the figures
// are then a lower bound and are worded "at least".

type Points = DeepenEstimate['round'];

const plural = (count: number, word: string): string =>
  `${countText(count)} ${word}${count === 1 ? '' : 's'}`;

function lowerBound(estimate: DeepenEstimate): string {
  return estimate.roles.some((role) => !role.priced) ? 'at least ' : '';
}

function costs(points: Points, estimate: DeepenEstimate): string {
  const some = lowerBound(estimate);
  const of = (scenario: keyof Points): string =>
    `${some}${dollars(BigInt(points[scenario].costMicros))}`;
  return `likely ${of('likely')} (low ${of('low')}, high ${of('high')})`;
}

const microsOf = (cap: DeepenEstimate['cap']): string => dollars(BigInt(cap.maxCostMicros));

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
  const { cap } = estimate;
  return (
    `Up to ${plural(estimate.maxRounds, 'round')}: ${costs(estimate.allRounds, estimate)}. ` +
    'This is a working ceiling, not a maximum: a later round can need more than the first. ' +
    `The run cap of ${microsOf(cap)} is what stops the run (it also stops at ${countText(cap.maxTokens)} tokens).`
  );
}

// RF-427
export function overCapTexts(estimate: DeepenEstimate): readonly string[] {
  const { cap, overCap } = estimate;
  const high = (points: Points): string => dollars(BigInt(points.high.costMicros));
  const tail = `could pass the run cap (${microsOf(cap)}). The run stops cleanly at the cap and can be resumed.`;
  return [
    ...(overCap.round
      ? [`The high figure for the first round (${high(estimate.round)}) ${tail}`]
      : []),
    ...(overCap.allRounds
      ? [`The high figure for all rounds (${high(estimate.allRounds)}) ${tail}`]
      : []),
  ];
}
