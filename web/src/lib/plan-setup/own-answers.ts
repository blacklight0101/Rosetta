// RF-645, RF-605, DEC-178, data-model.md section 3.20: which option answered a question (`chosen`)
// and the text of a typed answer (`typed`), and what a save sends of them.

/** The `chosen` value of a question answered with "Type your own answer". */
export const TYPED = 'typed';

/**
 * DEC-184: a typed answer to one of the text questions reaches the planner as the owner's own
 * words, so the question leaves the defaulted list.
 */
export const OWN_NOTE = 'Recorded; the planner reads it as your own answer';

/** The questions whose typed answer is kept as text of its own; the others use their own field. */
export const TEXT_QUESTIONS = ['principles', 'architecture', 'migration', 'buildMethod'] as const;

type Record2 = Readonly<Record<string, string>>;

/** The typed text of a question, trimmed; empty when the question was not answered by typing. */
export function ownText(chosen: Record2, typed: Record2, id: string): string {
  return chosen[id] === TYPED ? (typed[id] ?? '').trim() : '';
}

/** True when the question was answered by typing and the text is still empty. */
export function ownIsEmpty(chosen: Record2, typed: Record2, id: string): boolean {
  return chosen[id] === TYPED && ownText(chosen, typed, id) === '';
}

/** What a save sends: only the questions it sends, a typed text only for the four text questions. */
export function ownAnswersOf(
  draft: { readonly chosen: Record2; readonly typed: Record2 },
  sends: (id: string) => boolean,
): { readonly chosen?: Record2; readonly typed?: Record2 } {
  const chosen = Object.entries(draft.chosen).filter(([id]) => sends(id));
  const typed = TEXT_QUESTIONS.flatMap((id) => {
    const text = ownText(draft.chosen, draft.typed, id);
    return sends(id) && text !== '' ? [[id, text] as const] : [];
  });
  return {
    ...(chosen.length === 0 ? {} : { chosen: Object.fromEntries(chosen) }),
    ...(typed.length === 0 ? {} : { typed: Object.fromEntries(typed) }),
  };
}
