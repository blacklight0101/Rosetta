import type { GapEntries, GapProblem } from './gap-answer.js';
import type { HandoffPackage } from './handoff-package.js';

// P7-14, RF-627, ADR-013: what a gap round tells the log and checks.md beyond the cards it left out:
// an answer that was read card by card because it was not JSON as a whole, and the cards kept with
// entries of `dependsOn` dropped. checks.md lists every card the gap and the repair answers left out
// and every card kept with dropped entries, under an area per answer, by position and field, with a
// fixed reason; nothing here is text of the answer.

/** The log lines for an answer read card by card and for the entries it dropped. */
export function entryWarnings(
  label: string,
  salvaged: boolean,
  entries: readonly GapEntries[],
): string[] {
  const whole = salvaged
    ? [`The ${label} was not valid JSON as a whole; its task cards were read one by one.`]
    : [];
  return [
    ...whole,
    ...entries.map(
      ({ position, field, count }) =>
        `Task card at position ${String(position)} of the ${label} was kept, but ${entryCount(count)} of the field "${field}" named no card position or card id and ${count === 1 ? 'was' : 'were'} dropped.`,
    ),
  ];
}

function entryCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'entry' : 'entries'}`;
}

type LeftOut = HandoffPackage['leftOut'][number];

/** The rows of checks.md for one gap answer, by position: cards left out and cards with dropped entries. */
export function gapLeftOutItems(
  area: string,
  problems: readonly GapProblem[],
  entries: readonly GapEntries[],
): LeftOut[] {
  const rows = [
    ...problems.map(({ position, field, reason }) => ({
      position,
      row: { area, item: String(position), field, reason: `It ${reason}; the card was left out.` },
    })),
    ...entries.map(({ position, field, count }) => ({
      position,
      row: {
        ...{ area, item: String(position), field },
        reason: `${upper(entryCount(count))} named no card position or card id and ${count === 1 ? 'was' : 'were'} dropped; the card was kept.`,
      },
    })),
  ];
  return rows.sort((left, right) => left.position - right.position).map((each) => each.row);
}

function upper(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
