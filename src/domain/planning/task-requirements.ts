import type { LeftOutCard } from './left-out-card.js';
import { noRequirement } from './left-out-card.js';
import type { EntryNote, PlanDraft } from './plan-draft.js';
import { unknownPositions, type RequirementNote } from './requirement-notes.js';

// P7-15, RF-607, RF-627: the requirements of a package task card. Under SDD a card that implements
// no requirement is not written, except one that named something that was dropped (an id that resolves
// to nothing, or an entry that was none): like a gap card (P7-14) it is kept without a requirement and
// checks.md notes that it needs one. A card whose list was empty to begin with is still left out.

/** The requirements of the draft task, and why it has none to be a card, when that is so. */
export function taskRequirements(
  ids: readonly string[],
  options: {
    readonly specified: boolean;
    readonly entries: readonly EntryNote[];
    readonly card: number;
  },
): { readonly requirements: string[]; readonly fault?: Omit<LeftOutCard, 'position'> } {
  const requirements = [...new Set(ids)];
  if (!options.specified || requirements.length > 0) return { requirements };
  const named = options.entries.some(
    (each) => each.card === options.card && each.field === 'requirements',
  );
  return named ? { requirements } : { requirements, fault: noRequirement };
}

/** The notes about the kept cards (in order, so T-001...) that have no requirement under SDD. */
export function taskRequirementNotes(
  kept: readonly { readonly requirements: readonly string[] }[],
  specified: boolean,
): RequirementNote[] {
  return kept.flatMap((each, index): RequirementNote[] =>
    specified && each.requirements.length === 0
      ? [{ kind: 'none', task: `T-${String(index + 1).padStart(3, '0')}` }]
      : [],
  );
}

/** The notes about the entries of the lists code mapped or dropped while reading the answer. */
export function entryNotesOf(entries: readonly EntryNote[] = []): RequirementNote[] {
  return entries.map((each): RequirementNote => ({ kind: 'entries', ...each }));
}

/** All the notes about the requirements of the task cards, in the order they were found. */
export function planNotes(
  draft: Pick<PlanDraft, 'tasks' | 'requirements' | 'entryNotes'>,
  unbacked: readonly RequirementNote[],
): RequirementNote[] {
  return [
    ...entryNotesOf(draft.entryNotes),
    ...unknownPositions(draft.tasks, draft.requirements.length),
    ...unbacked,
  ];
}
