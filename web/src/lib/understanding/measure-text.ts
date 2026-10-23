import type { MeasureFigures } from '../../api/understanding.js';

// RF-231, RF-230, RFC-003 section 6: the words for the honest measures of an understand run: the
// first-party coverage by tokens, the first-party files not read, the Supported share with its
// counts, the claims not judged, the rejected claims no Supported claim replaces, and the
// third-party and generated code, which is apart and in no percentage. The page never says
// "complete" or "fully understood" and reports no percentage by claim. It says "well covered" only
// when at least 80% of the first-party tokens were read and no claim is left unjudged (Q-K); it
// works that out from the numbers, whatever a flag says, and a percentage is cut down, never
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
function percentText(share: number): string {
  const whole = Math.floor(share * 100);
  return whole === 0 && share > 0 ? 'less than 1%' : `${String(whole)}%`;
}

const plural = (count: number, word: string): string =>
  `${countText(count)} ${word}${count === 1 ? '' : 's'}`;

/** RF-231, Q-K. */
function isWellCovered(measures: MeasureSet): boolean {
  const share = measures.firstPartyCoverage;
  return share !== null && share >= WELL_COVERED_SHARE && measures.notJudged === 0;
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

/** EV-04: a file not read; a partly read one says how much of it is left (same words as the overview). */
export function unreadSizeText(file: {
  readonly tokens: number;
  readonly unreadShare?: number | undefined;
}): string {
  const tokens = `${countText(file.tokens)} tokens`;
  if (file.unreadShare === undefined) return tokens;
  return `${tokens} unread, ${(file.unreadShare * 100).toFixed(1)}% of the file`;
}

/** Read after the count: "10 files; the largest are listed below" (Q-44). */
function filesNotReadDetail(count: number): string {
  if (count === 0) return 'files; every first-party file was read';
  return count === 1 ? 'file; it is listed below' : 'files; the largest are listed below';
}

// RF-231
export function measureRows(measures: MeasureSet): readonly MeasureRow[] {
  return [
    coverageRow(measures),
    {
      ...{ id: 'notRead', label: 'First-party files not read' },
      value: countText(measures.filesNotReadCount),
      detail: filesNotReadDetail(measures.filesNotReadCount),
    },
    shareRow(measures),
    {
      ...{ id: 'notJudged', label: 'Not judged' },
      value: countText(measures.notJudged),
      detail: measures.notJudged === 1 ? 'claim left Unverified' : 'claims left Unverified',
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

type Direction = 'higherIsBetter' | 'lowerIsBetter' | 'neutral';

function kindOf(delta: number, direction: Direction): ChangeRow['kind'] {
  if (delta === 0) return 'same';
  if (direction === 'neutral') return 'info';
  return delta > 0 === (direction === 'higherIsBetter') ? 'better' : 'worse';
}

function changeText(delta: number, unit: string): string {
  if (delta === 0) return 'no change';
  return `${delta > 0 ? 'up' : 'down'} ${countText(Math.abs(delta))}${unit}`;
}

interface Figure {
  readonly id: string;
  readonly label: string;
  readonly direction: Direction;
  readonly pick: (measures: MeasureSet) => number;
  readonly show: (measures: MeasureSet) => string;
  readonly unit?: string;
}

const figures: readonly Figure[] = [
  {
    ...{ id: 'coverage', label: 'First-party coverage', direction: 'higherIsBetter' },
    pick: (m) => Math.round((m.firstPartyCoverage ?? 0) * 100),
    show: (m) => (m.firstPartyCoverage === null ? 'none read' : percentText(m.firstPartyCoverage)),
    unit: ' points',
  },
  {
    ...{ id: 'notRead', label: 'First-party files not read', direction: 'lowerIsBetter' },
    ...{ pick: (m) => m.filesNotReadCount, show: (m) => countText(m.filesNotReadCount) },
  },
  {
    ...{ id: 'supported', label: 'Supported claims', direction: 'higherIsBetter' },
    ...{ pick: (m) => m.supported, show: (m) => countText(m.supported) },
  },
  {
    ...{ id: 'rejected', label: 'Rejected claims', direction: 'neutral' },
    ...{ pick: (m) => m.rejected, show: (m) => countText(m.rejected) },
  },
  {
    ...{ id: 'notJudged', label: 'Not judged', direction: 'lowerIsBetter' },
    ...{ pick: (m) => m.notJudged, show: (m) => countText(m.notJudged) },
  },
  {
    ...{ id: 'unresolved', label: 'Rejected, not replaced', direction: 'lowerIsBetter' },
    ...{ pick: (m) => m.rejectedUnresolved, show: (m) => countText(m.rejectedUnresolved) },
  },
  {
    ...{ id: 'afterReread', label: 'Supported after a re-read', direction: 'neutral' },
    ...{ pick: (m) => m.supportedAfterReread, show: (m) => countText(m.supportedAfterReread) },
  },
];

// RF-231
export function beforeAfterRows(before: MeasureSet, after: MeasureSet): readonly ChangeRow[] {
  return figures.map((figure) => {
    const delta = figure.pick(after) - figure.pick(before);
    const apart = figure.id === 'afterReread' && delta !== 0 ? ', listed apart' : '';
    return {
      ...{ id: figure.id, label: figure.label },
      ...{ before: figure.show(before), after: figure.show(after) },
      kind: kindOf(delta, figure.direction),
      change: `${changeText(delta, figure.unit ?? '')}${apart}`,
    };
  });
}

const stops: Readonly<Record<string, (done: string) => string>> = {
  noProgress: () =>
    'No progress: the last round added no new supported claim and read no new first-party file.',
  roundLimit: (done) => `The round limit was reached: ${done} rounds ran.`,
  capReached: (done) => `A cap stopped it after ${done} rounds. The run can be resumed.`,
  stopped: (done) => `You stopped it after ${done} rounds.`,
};

// RF-209
export function stopText(reason: string, roundsDone: number, maxRounds: number): string {
  const done = `${String(roundsDone)} of ${String(maxRounds)}`;
  const write = Object.hasOwn(stops, reason) ? stops[reason] : undefined;
  return write === undefined ? `It stopped after ${done} rounds.` : write(done);
}

/** RF-231: whether a run in a list can have measures: an understand run that ended and read something. */
export function mayHaveMeasures(run: {
  readonly stage: string;
  readonly endState: string | null;
}): boolean {
  const readSomething = ['Completed', 'CapReached', 'Interrupted'];
  return (
    run.stage === 'understand' && run.endState !== null && readSomething.includes(run.endState)
  );
}

/** RF-231: the measures of a run on one line, for a list: what was read, confirmed and not judged. */
export function measureLine(measures: MeasureSet): string {
  const share = measures.firstPartyCoverage;
  const read =
    share === null
      ? 'no first-party code read'
      : `${percentText(share)} of first-party tokens read`;
  const judged = measures.supported + measures.rejected;
  const confirmed =
    judged === 0
      ? 'no claim judged'
      : `${countText(measures.supported)} of ${countText(judged)} judged claims supported`;
  return [read, confirmed, `${countText(measures.notJudged)} not judged`].join(' · ');
}
