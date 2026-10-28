import type { CardType } from '../../domain/cards/card-vocabulary.js';
import type { OpenQuestion, RecordedQuestion } from '../ports/answers-file.js';

// P5-11, RF-243, RF-1007, data-model.md sections 3.7 and 3.16: the open questions of a run are those
// of its consolidated card set. `answers.md` is written before consolidation, so it can hold the id of
// an `OQ` card that a merge took away (P3-106), and lack the card that survived. Consolidation records
// the merge exactly: the survivor keeps the id of the first card and lists every id it absorbed in
// `mergedFrom`. That is the map from a merged-away id to its survivor; no question is matched by its
// words. Every reader of a run's questions (the answers page and its save and reopen, the plan inputs
// and package, the report and the journey) goes through `consolidatedQuestions`, so they agree.
// Nothing is ever removed from `answers.md`: a merged-away section stays there, unlisted.

/** What the map needs of a card: `PriorCard` has it, so has every card read back from a run. */
export interface MergeCard {
  readonly id: string;
  readonly type: CardType;
  readonly title: string;
  readonly question?: string | undefined;
  readonly mergedFrom?: readonly string[] | undefined;
  readonly claims: readonly string[];
}

/** A listed question; `filed` is false when `answers.md` has no section under its id. */
interface Listed extends RecordedQuestion {
  readonly filed: boolean;
}

const isBlank = (answer: string): boolean => answer.trim() === '';

/** Merged-away id -> the id of the open question card that absorbed it. */
export function survivorsOf(cards: readonly MergeCard[]): ReadonlyMap<string, string> {
  const open = cards.filter((card) => card.type === 'OQ');
  const live = new Set(open.map((card) => card.id));
  const map = new Map<string, string>();
  for (const card of open) {
    for (const id of card.mergedFrom ?? []) {
      if (id !== card.id && !live.has(id) && !map.has(id)) map.set(id, card.id);
    }
  }
  return map;
}

interface Group {
  own?: RecordedQuestion;
  readonly away: { readonly rank: number; readonly question: RecordedQuestion }[];
}

function groupsOf(
  filed: readonly RecordedQuestion[],
  survivors: ReadonlyMap<string, string>,
  open: ReadonlyMap<string, MergeCard>,
): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const question of filed) {
    const target = survivors.get(question.cardId) ?? question.cardId;
    const group = groups.get(target) ?? { away: [] };
    groups.set(target, group);
    if (target === question.cardId) group.own ??= question;
    else {
      const rank = open.get(target)?.mergedFrom?.indexOf(question.cardId) ?? 0;
      group.away.push({ rank, question });
    }
  }
  return groups;
}

/** The answer a survivor shows: its own, else the first filled one of the questions it absorbed. */
function answerOf(own: RecordedQuestion | undefined, away: readonly RecordedQuestion[]): string {
  if (own !== undefined && !isBlank(own.answer)) return own.answer;
  return away.find((each) => !isBlank(each.answer))?.answer ?? own?.answer ?? '';
}

function listedOf(id: string, group: Group, card: MergeCard | undefined): Listed {
  const away = [...group.away].sort((a, b) => a.rank - b.rank).map((each) => each.question);
  const answer = answerOf(group.own, away);
  if (group.own !== undefined) return { ...group.own, answer, filed: true };
  const question = card?.question ?? card?.title ?? '';
  return { cardId: id, question, context: away[0]?.context ?? '', answer, filed: false };
}

function listing(
  filed: readonly RecordedQuestion[],
  cards: readonly MergeCard[],
): readonly Listed[] {
  const survivors = survivorsOf(cards);
  if (survivors.size === 0) return filed.map((question) => ({ ...question, filed: true }));
  const open = new Map(cards.filter((card) => card.type === 'OQ').map((card) => [card.id, card]));
  const groups = groupsOf(filed, survivors, open);
  const listed = [...groups].map(([id, group]) => listedOf(id, group, open.get(id)));
  // A survivor no section of the file stands for is still a question the user can answer.
  const absent = [...open.values()].filter(
    (card) => (card.mergedFrom?.length ?? 0) > 1 && !groups.has(card.id),
  );
  const added = absent.map((card) => ({
    ...{ cardId: card.id, question: card.question ?? card.title },
    ...{ context: card.claims[0] ?? '', answer: '', filed: false },
  }));
  return [...listed, ...added];
}

/**
 * The questions of the run after consolidation, in file order. An answer under a merged-away id
 * goes to its survivor unless the survivor has its own; a run with no merge lists the file as it is.
 */
// RF-243, RF-1007
export function consolidatedQuestions(
  filed: readonly RecordedQuestion[],
  cards: readonly MergeCard[],
): readonly RecordedQuestion[] {
  return listing(filed, cards).map(({ cardId, question, context, answer, options, chosen }) => ({
    ...{ cardId, question, context, answer },
    // RF-645: a question with suggested answers keeps them and the choice made among them.
    ...(options === undefined ? {} : { options, chosen: chosen ?? '' }),
  }));
}

/** The listed questions `answers.md` has no section for: saving an answer first adds the section. */
// RF-1007
export function unfiledQuestions(
  filed: readonly RecordedQuestion[],
  cards: readonly MergeCard[],
  runKey: string,
): readonly OpenQuestion[] {
  return listing(filed, cards)
    .filter((question) => !question.filed)
    .map(({ cardId, question, context }) => ({ cardId, runKey, question, context }));
}
