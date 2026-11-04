import type { DeepenEstimate } from '../../api/understanding.js';
import { dollars, isLocalModel, tokensText } from '../estimate-math.js';
import { costLabel, leftLabel } from '../live-run/format.js';
import { countText } from './measure-text.js';

// RF-209, RF-425, RF-434, ADR-007, DEC-145, DEC-206: the words for the estimate of a Deepen. The first
// round is planned from the completed run. The figure for all rounds is the first round times the
// round limit: a working ceiling, not a maximum, because a later round can need more than the first.
// What stops the run is the one amount that applies: what is left of the journey's approved amount
// (the run then pauses and asks), or the run cap of a project without a journey. A role whose model
// has no price counts as zero in the figures, so the figures are then a lower bound and are worded
// "at least". With a local model (Ollama, Q-44) the figures are tokens and a warning is about a token
// cap only: it never reads "$0.00 could pass the run cap".

type Points = DeepenEstimate['round'];

const plural = (count: number, word: string): string =>
  `${countText(count)} ${word}${count === 1 ? '' : 's'}`;

function lowerBound(estimate: DeepenEstimate): string {
  return estimate.roles.some((role) => !role.priced) ? 'at least ' : '';
}

const isLocal = (estimate: DeepenEstimate): boolean =>
  estimate.roles.length > 0 && estimate.roles.every((role) => isLocalModel(role.kind));

const tokensOf = (point: Points['high']): number => point.inputTokens + point.outputTokens;

/** `likely $0.40`, or `likely 40,000 tokens` for a local model. */
function likelyOf(points: Points, estimate: DeepenEstimate): string {
  const { likely } = points;
  return isLocal(estimate)
    ? `likely ${tokensText(tokensOf(likely))}`
    : `likely ${lowerBound(estimate)}${dollars(BigInt(likely.costMicros))}`;
}

const microsOf = (cap: DeepenEstimate['cap']): string => dollars(BigInt(cap.maxCostMicros));

/** The amount left of the approval, and the amount approved, in the unit of the estimate. */
function approvalOf(estimate: DeepenEstimate): { left: string; approved: string } | undefined {
  const { journey } = estimate;
  if (journey === undefined || journey === null) return undefined;
  if (isLocal(estimate)) {
    return {
      left: tokensText(journey.remainingTokens),
      approved: journey.approvedTokens.toLocaleString('en-US'),
    };
  }
  return {
    left: leftLabel(journey.remainingMicros),
    approved: costLabel(journey.approvedMicros),
  };
}

/** The run cap in the unit of the estimate; a local model costs nothing, so only its tokens count. */
const capOf = (estimate: DeepenEstimate): string =>
  isLocal(estimate) ? tokensText(estimate.cap.maxTokens) : microsOf(estimate.cap);

// RF-209
export function roundPlanText(estimate: DeepenEstimate): string {
  const { plan } = estimate;
  const reads =
    plan.unreadFiles === 0
      ? ''
      : ` and reads ${plural(plan.unreadFiles, 'first-party file')} never read (${countText(plan.unreadTokens)} tokens)`;
  const failed =
    plan.failedAreas === 0
      ? ''
      : ` and reads again ${plural(plan.failedAreas, 'area')} that failed`;
  const apart =
    plan.outOfScope === 0
      ? ''
      : ` ${plural(plan.outOfScope, 'rejected claim')} cite only third-party or generated code and are left out of scope.`;
  const answers =
    plan.answers === 0 ? '' : ` It uses ${plural(plan.answers, 'answer')} you already gave.`;
  return (
    `It judges ${plural(plan.judge, 'claim')}, ` +
    `re-reads ${plural(plan.reread, 'rejected claim')}${failed}${reads}.${apart}${answers}`
  );
}

/** The three figures of the panel and the sentence under them (P8-24). */
export interface DeepenFigures {
  readonly first: string;
  readonly all: string;
  readonly allLabel: string;
  readonly stops: string;
  readonly note: string;
}

// RF-434
export function deepenFiguresOf(estimate: DeepenEstimate): DeepenFigures {
  const approval = approvalOf(estimate);
  return {
    first: likelyOf(estimate.round, estimate),
    all: likelyOf(estimate.allRounds, estimate),
    allLabel: `Up to ${plural(estimate.maxRounds, 'round')}`,
    stops:
      approval === undefined
        ? `${capOf(estimate)} run cap`
        : `${approval.left} left of ${approval.approved}`,
    note:
      approval === undefined
        ? 'If a round would pass the run cap, the run stops cleanly at the cap and can be resumed.'
        : 'If a round would pass the approved amount, the run pauses and asks you before it spends more.',
  };
}

/** The one line of the question before the Deepen starts: the likely cost and the amount left. */
// RF-434
export function confirmLineOf(estimate: DeepenEstimate): string {
  const approval = approvalOf(estimate);
  const figures = deepenFiguresOf(estimate);
  const stops =
    approval === undefined
      ? `the run cap of ${capOf(estimate)}`
      : `the ${approval.left} left of your ${approval.approved} approval`;
  return `${figures.allLabel}, ${figures.all}. It stops at ${stops}.`;
}

/** What the warning says the high figure could pass, and what happens when it does. */
function limitOf(estimate: DeepenEstimate): { name: (tokens: boolean) => string; then: string } {
  const approval = approvalOf(estimate);
  if (approval !== undefined) {
    const named = `${approval.left} left of your ${approval.approved} approval`;
    return { name: () => named, then: 'The run pauses and asks you before it spends more.' };
  }
  return {
    name: (tokens) =>
      tokens
        ? `run token cap (${tokensText(estimate.cap.maxTokens)})`
        : `run cap (${microsOf(estimate.cap)})`,
    then: 'The run stops cleanly at the cap and can be resumed.',
  };
}

/**
 * The warning for one flagged figure, in the unit of the amount it could pass: tokens for the token
 * amount, dollars for the cost amount. A local model has no cost, so only its tokens can warn.
 */
function warningOf(what: string, points: Points, estimate: DeepenEstimate): readonly string[] {
  const { cap } = estimate;
  const tokensOver = tokensOf(points.high) > cap.maxTokens;
  const costOver = BigInt(points.high.costMicros) > BigInt(cap.maxCostMicros);
  const limit = limitOf(estimate);
  const intro = `The high figure for ${what}`;
  const tokens = tokensText(tokensOf(points.high));
  const byTokens = `${intro} (${tokens}) could pass the ${limit.name(true)}. ${limit.then}`;
  if (isLocal(estimate)) return tokensOver ? [byTokens] : [];
  if (tokensOver && !costOver) return [byTokens];
  const money = dollars(BigInt(points.high.costMicros));
  return [`${intro} (${money}) could pass the ${limit.name(false)}. ${limit.then}`];
}

/** RF-427: one warning, about all rounds (the larger figure), or about the first round alone. */
// RF-427
export function overCapTexts(estimate: DeepenEstimate): readonly string[] {
  const { overCap } = estimate;
  if (overCap.allRounds) return warningOf('all rounds', estimate.allRounds, estimate);
  return overCap.round ? warningOf('the first round', estimate.round, estimate) : [];
}
