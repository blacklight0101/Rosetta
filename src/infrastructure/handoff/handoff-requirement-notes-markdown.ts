import type { RequirementNote } from '../../domain/planning/requirement-notes.js';

// RF-627, RF-630, RF-631: the part of checks.md about the requirements of the task cards. Code
// made each task card list the requirements whose source cards are behind what it builds, and it
// ignored a requirement position the plan answer named that the list does not have; the section
// says each of these, in the order the plan was checked in. Ids and counts are Rosetta's, so
// nothing here is model text and nothing needs escaping.

const SHARED = 'its source cards';

const NOUNS: Readonly<Record<string, string>> = {
  requirements: 'requirement position or cited source card id',
  dependsOn: 'task card position',
};

const entries = (count: number): string => `${String(count)} ${count === 1 ? 'entry' : 'entries'}`;
const were = (count: number): string => (count === 1 ? 'was' : 'were');

/** P7-15: what happened to the entries of one list of a card that was kept. */
function changesOf(note: { mapped: number; dropped: number }, field: string): string {
  const mapped = `${entries(note.mapped)} named a source card id and ${were(note.mapped)} mapped to the requirements that cite it`;
  const noun = NOUNS[field] ?? 'position';
  const dropped = `${entries(note.dropped)} named no ${noun} and ${were(note.dropped)} dropped`;
  return [...(note.mapped > 0 ? [mapped] : []), ...(note.dropped > 0 ? [dropped] : [])].join('; ');
}

function lineOf(note: RequirementNote): string {
  if (note.kind === 'entries') {
    return `- The task card at position ${String(note.card)} of the plan answer was kept; in its "${note.field}", ${changesOf(note, note.field)}.`;
  }
  if (note.kind === 'cited') {
    return `- ${note.task} was kept; in its "requirements", ${changesOf(note, 'requirements')}.`;
  }
  if (note.kind === 'none') {
    return `- ${note.task} names no requirement the plan has: the card is kept without a requirement, and needs one (RF-607).`;
  }
  if (note.kind === 'position') {
    const { card, position, count } = note;
    const size = `${String(count)} requirement${count === 1 ? '' : 's'}`;
    return `- The task card at position ${String(card)} of the plan answer lists requirement position ${String(position)}, but the plan has ${size}; that position was ignored.`;
  }
  if (note.kind === 'unbacked') {
    return `- ${note.task} builds ${note.item}, but no requirement cites a source card behind it: the card is kept without a requirement, and the item needs a requirement (RF-607).`;
  }
  const { task, requirement } = note;
  const none = `${SHARED} share nothing with what the task builds`;
  if (note.kind === 'unmatched') {
    const why =
      note.kept === 1
        ? 'it is the only requirement of the card'
        : `the card keeps all ${String(note.kept)} of its requirements`;
    return `- ${task} keeps ${requirement} although ${none}: ${why}.`;
  }
  if (note.kind === 'added') {
    return `- ${task} gained ${requirement}: ${SHARED} are behind what the task builds.`;
  }
  return `- ${task} lost ${requirement}: ${none}, and another card builds an item behind them.`;
}

/** The section about the requirements of the task cards; nothing when no note was made. */
// RF-627
export function requirementLines(notes: readonly RequirementNote[]): string[] {
  if (notes.length === 0) return [];
  return [
    '## Requirements of the task cards',
    '',
    'A task card lists the requirements whose source cards are behind the items it builds. Where the planner listed others, or a position the list does not have, the package says what was changed.',
    '',
    ...notes.map(lineOf),
    '',
  ];
}
