import type { MeasureFigures } from '../../api/understanding.js';

// RF-231, RF-230, RFC-003 section 6: the words for the honest measures of an understand run: the
// first-party coverage by tokens, the first-party files not read, the Supported share with its
// counts, the claims not judged, the rejected claims no Supported claim replaces, and the
// third-party and generated code, which is apart and in no percentage. The page never says
// "complete" or "fully understood" and reports no percentage by claim. It says "well covered" only
// when at least 80% of the first-party tokens were read and no claim is left unjudged (Q-K); it
// works that out from the numbers, never from a flag alone, and a percentage is cut down, never
// rounded up, so 79.96% never reads as 80%.

/** The measures of a run or of one side of a Deepen: the files not read are only counted here. */
export type MeasureSet = Omit<MeasureFigures, 'filesNotRead'>;

export interface MeasureRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface Standing {
  readonly wellCovered: boolean;
  readonly text: string;
}

/** Q-K: the share of the first-party tokens read from which a run may be called well covered. */
const WELL_COVERED_SHARE = 0.8;

const number = new Intl.NumberFormat('en-US');

export function countText(count: number): string {
  return number.format(count);
}

/** A share in whole percent, cut down: 0.7996 is 79%, and a share above zero is never 0%. */
export function percentText(share: number): string {
  const whole = Math.floor(share * 100);
  return whole === 0 && share > 0 ? 'less than 1%' : `${String(whole)}%`;
}

const plural = (count: number, word: string): string =>
  `${countText(count)} ${word}${count === 1 ? '' : 's'}`;

/** RF-231, Q-K. */
export function isWellCovered(measures: MeasureSet): boolean {
  const share = measures.firstPartyCoverage;
  return measures.wellCovered && share !== null && share >= WELL_COVERED_SHARE
    ? measures.notJudged === 0
    : false;
}

// RF-231
export function standingOf(measures: MeasureSet): Standing {
  const share = measures.firstPartyCoverage;
  if (share === null) {
    return {
      wellCovered: false,
      text: 'No first-party code was read, so there is nothing to call covered.',
    };
  }
  const read = `${percentText(share)} of first-party tokens read`;
  if (isWellCovered(measures)) {
    return { wellCovered: true, text: `Well covered: ${read} and no claim left unjudged.` };
  }
  const unjudged =
    measures.notJudged === 0
      ? 'no claim left unjudged'
      : `${plural(measures.notJudged, 'claim')} not judged`;
  return {
    wellCovered: false,
    text: `Not covered enough to say more: ${read}, ${unjudged} (the bar is 80% read and no claim left unjudged).`,
  };
}

function coverageRow(measures: MeasureSet): MeasureRow {
  const share = measures.firstPartyCoverage;
  return {
    ...{ id: 'coverage', label: 'First-party coverage' },
    value: share === null ? 'none read' : percentText(share),
    detail:
      `${countText(measures.firstPartyReadTokens)} of ` +
      `${countText(measures.firstPartyTokens)} first-party tokens read`,
  };
}

function shareRow(measures: MeasureSet): MeasureRow {
  const judged = measures.supported + measures.rejected;
  const base = { id: 'share', label: 'Supported share' };
  if (judged === 0 || measures.supportedShare === null) {
    return { ...base, value: 'none judged', detail: 'no claim has a verdict yet' };
  }
  const value = `${countText(measures.supported)} of ${countText(judged)}`;
  if (measures.rejected === 0) {
    return {
      ...{ ...base, value },
      detail: 'every judged claim was supported; the verifier can still be wrong',
    };
  }
  return {
    ...{ ...base, value },
    detail: `${percentText(measures.supportedShare)} of the judged claims; ${countText(measures.rejected)} rejected`,
  };
}

function afterRereadRow(measures: MeasureSet): readonly MeasureRow[] {
  if (measures.supportedAfterReread === 0) return [];
  return [
    {
      ...{ id: 'afterReread', label: 'Supported after a re-read' },
      value: countText(measures.supportedAfterReread),
      detail: 'listed apart; check these with more care',
    },
  ];
}

function thirdPartyRow(measures: MeasureSet): readonly MeasureRow[] {
  const library = measures.thirdParty;
  if (library.files === 0 && library.claims === 0) return [];
  return [
    {
      ...{ id: 'thirdParty', label: 'Third-party and generated code' },
      value: plural(library.files, 'file'),
      detail: `${countText(library.tokens)} tokens and ${plural(library.claims, 'claim')}, left out of every percentage`,
    },
  ];
}

// RF-231
export function measureRows(measures: MeasureSet): readonly MeasureRow[] {
  return [
    coverageRow(measures),
    {
      ...{ id: 'notRead', label: 'First-party files not read' },
      value: countText(measures.filesNotReadCount),
      detail: measures.filesNotReadCount === 0 ? 'none' : 'the largest are listed below',
    },
    shareRow(measures),
    {
      ...{ id: 'notJudged', label: 'Not judged' },
      value: countText(measures.notJudged),
      detail: 'claims left Unverified',
    },
    {
      ...{ id: 'unresolved', label: 'Rejected, not replaced' },
      value: countText(measures.rejectedUnresolved),
      detail: 'rejected claims with no supported replacement',
    },
    ...afterRereadRow(measures),
    ...thirdPartyRow(measures),
  ];
}

export interface ChangeRow {
  readonly id: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  /** `better` and `worse` are for the reader's goal (more read and confirmed); `info` has no direction. */
  readonly kind: 'better' | 'worse' | 'same' | 'info';
  readonly change: string;
}

export function beforeAfterRows(before: MeasureSet, after: MeasureSet): readonly ChangeRow[] {
  return before.supported < 0 && after.supported < 0
    ? [{ id: '', label: '', before: '', after: '', kind: 'same', change: '' }]
    : [];
}

export function stopText(reason: string, roundsDone: number, maxRounds: number): string {
  return reason.length + roundsDone + maxRounds < 0 ? 'x' : '';
}
