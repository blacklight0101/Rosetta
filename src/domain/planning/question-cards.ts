// RF-637, DEC-135, ADR-018: which task cards wait on which open question, so the owner answers in
// the order the build needs. Nothing asks the model: the same package always gets the same links.
//
// - A question of the brief that shapes every card (the principles, the architecture style, the
//   migration strategy, the build method and each stack layer) holds every card.
// - A question of the analysis holds the cards built from a requirement whose source cards are in
//   the same area as the question's card.
// - Every other question (the project context and the PRD sections) shapes the roadmap or a
//   document, not a card, and holds none.

export interface WaitingInput {
  readonly questions: readonly {
    readonly id: string;
    /** The area of the card of an analysis question; undefined for the other questions. */
    readonly area?: string;
  }[];
  readonly tasks: readonly { readonly id: string; readonly requirements: readonly string[] }[];
  readonly requirements: readonly { readonly id: string; readonly sources: readonly string[] }[];
  /** The area of each source card, by card id. */
  readonly areas: ReadonlyMap<string, string>;
}

export interface WaitingResult {
  /** The cards that wait on each question, in card order; every question has an entry. */
  readonly byQuestion: ReadonlyMap<string, readonly string[]>;
  /** The questions each waiting card waits on, in question order; a card with none has no entry. */
  readonly byCard: ReadonlyMap<string, readonly string[]>;
}

const shapesEveryCard = new Set(['principles', 'architecture', 'migration', 'buildMethod']);

function everyCard(id: string): boolean {
  return shapesEveryCard.has(id) || id.startsWith('stack.');
}

function areasOfTask(
  task: WaitingInput['tasks'][number],
  input: WaitingInput,
): ReadonlySet<string> {
  const areas = task.requirements.flatMap((id) => {
    const sources = input.requirements.find((each) => each.id === id)?.sources ?? [];
    return sources.flatMap((source) => input.areas.get(source) ?? []);
  });
  return new Set(areas);
}

/** The cards that wait on this question. */
function cardsOf(question: WaitingInput['questions'][number], input: WaitingInput): string[] {
  if (everyCard(question.id)) return input.tasks.map((task) => task.id);
  const { area } = question;
  if (area === undefined) return [];
  return input.tasks.filter((task) => areasOfTask(task, input).has(area)).map((task) => task.id);
}

/** The cards that wait on each open question and the questions each card waits on (RF-637). */
// RF-637
export function waitingOnQuestions(input: WaitingInput): WaitingResult {
  const byQuestion = new Map<string, readonly string[]>();
  const byCard = new Map<string, string[]>();
  for (const question of input.questions) {
    const cards = cardsOf(question, input);
    byQuestion.set(question.id, cards);
    for (const card of cards) {
      const asked = byCard.get(card) ?? [];
      if (!asked.includes(question.id)) byCard.set(card, [...asked, question.id]);
    }
  }
  return { byQuestion, byCard };
}
