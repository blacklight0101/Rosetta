import type { RequirementNote } from '../../domain/planning/requirement-notes.js';

// RF-627, RF-630, RF-631: the part of checks.md about the requirements of the task cards. Code
// made each task card list the requirements whose source cards are behind what it builds, and it
// ignored a requirement position the plan answer named that the list does not have; the section
// says each of these, in the order the plan was checked in. Ids and counts are Rosetta's, so
// nothing here is model text and nothing needs escaping.

const SHARED = 'its source cards';

function lineOf(note: RequirementNote): string {
  if (note.kind === 'position') {
    const { card, position, count } = note;
    const size = `${String(count)} requirement${count === 1 ? '' : 's'}`;
    return `- The task card at position ${String(card)} of the plan answer lists requirement position ${String(position)}, but the plan has ${size}; that position was ignored.`;
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
  return `- ${task} lost ${requirement}: ${none}.`;
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
