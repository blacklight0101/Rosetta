import type { Card } from '../../domain/cards/card.js';
import { formatCitation } from '../../domain/cards/citation.js';
import { sameQuestion, sameSubject, sharedSubjectWords } from './same-question.js';
import type { MergedQuestion, OpenQuestion, SuggestedOption } from '../ports/answers-file.js';

// RF-243, RF-240, DEC-136: the open questions of a run as `answers.md` gets them. The same
// question asked by several areas, or twice in one (Q-52), is one question that keeps every citation; the questions are
// grouped by the area they concern and ordered by how much of the specification depends on them,
// so the user answers the ones that unlock most first. A question depends on the cards (other than
// open questions) that cite a file one of its cards cites. Everything is deterministic: ties keep
// the order of the cards, which is area and appearance order.

interface Group {
  readonly cards: readonly Card[];
  readonly area: string;
  readonly dependents: number;
}

export { sameQuestion };

function citedPaths(cards: readonly Card[]): ReadonlySet<string> {
  return new Set(
    cards.flatMap((card) => card.claims.flatMap((c) => c.citations.map((x) => x.path))),
  );
}

function dependentsOf(group: readonly Card[], others: readonly Card[]): number {
  const paths = citedPaths(group);
  return others.filter((card) =>
    card.claims.some((claim) => claim.citations.some((citation) => paths.has(citation.path))),
  ).length;
}

/** P8-08: the ranges two cards cite lie in the same file and one holds the other. */
function sameRange(left: Card, right: Card): boolean {
  const cites = (card: Card) => card.claims.flatMap((claim) => claim.citations);
  return cites(left).some((a) =>
    cites(right).some(
      (b) =>
        a.path === b.path &&
        ((a.startLine <= b.startLine && b.endLine <= a.endLine) ||
          (b.startLine <= a.startLine && a.endLine <= b.endLine)),
    ),
  );
}

/** Subject words two questions about the same cited range must share (P8-08, EV-89). */
const MIN_RANGE_WORDS = 2;

/**
 * EV-57, P8-08: whether two open questions of a run are one question: they ask the same by the
 * shared rule, or the same subject in other words, or they cite the same range and share subject
 * words (two questions about the same VBA source).
 */
function sameCard(left: Card, right: Card): boolean {
  const a = left.question ?? left.title;
  const b = right.question ?? right.title;
  return (
    sameQuestion(a, b) ||
    sameSubject(a, b) ||
    (sameRange(left, right) && sharedSubjectWords(a, b) >= MIN_RANGE_WORDS)
  );
}

/** EV-57: the questions of a run that ask the same, by the shared rule; the first of each is kept. */
function clustersOf(questions: readonly Card[]): readonly (readonly Card[])[] {
  const clusters: Card[][] = [];
  for (const card of questions) {
    const found = clusters.find((cluster) => {
      const head = cluster[0];
      return head !== undefined && sameCard(head, card);
    });
    if (found === undefined) clusters.push([card]);
    else found.push(card);
  }
  return clusters;
}

function groupsOf(cards: readonly Card[]): readonly Group[] {
  const questions = cards.filter((card) => card.type === 'OQ');
  const others = cards.filter((card) => card.type !== 'OQ');
  return clustersOf(questions).map((group) => ({
    cards: group,
    area: group[0]?.area ?? '',
    dependents: dependentsOf(group, others),
  }));
}

/** The first citation and claim of the first card; for a merged question the other citations too. */
function contextOf(cards: readonly Card[]): string {
  const [first, ...rest] = cards;
  const claim = first?.claims[0];
  const shown = claim?.citations[0];
  const where = shown === undefined ? '' : `${formatCitation(shown)} `;
  const context = `${where}${claim?.text ?? ''}`.trim();
  const own = shown === undefined ? '' : formatCitation(shown);
  const more = [
    ...new Set(
      rest.flatMap((card) =>
        card.claims.flatMap((each) => each.citations.map((citation) => formatCitation(citation))),
      ),
    ),
  ].filter((citation) => citation !== own);
  return more.length === 0 ? context : `${context} (also cited: ${more.join(', ')})`;
}

/** Areas with most dependants first; the first area of the cards decides ties. */
function areaOrder(groups: readonly Group[]): readonly string[] {
  const totals = new Map<string, number>();
  for (const group of groups)
    totals.set(group.area, (totals.get(group.area) ?? 0) + group.dependents);
  return [...totals.keys()]
    .map((area, index) => ({ area, index, total: totals.get(area) ?? 0 }))
    .sort((left, right) => right.total - left.total || left.index - right.index)
    .map((entry) => entry.area);
}

/** RF-645: the suggested answers of the card, as `answers.md` holds them; none on an older card. */
function optionsOf(card: Card | undefined): readonly SuggestedOption[] | undefined {
  const answers = card?.suggestedAnswers;
  if (answers === undefined || answers.length === 0) return undefined;
  return answers.map(({ answer, description, recommended }) => ({
    answer,
    description,
    recommended,
  }));
}

/** P8-08, EV-89: the questions of a run an owner can read at once; the rest follow "More questions". */
const QUESTIONS_SHOWN = 20;

// RF-243
export function openQuestionsOf(cards: readonly Card[], runKey: string): readonly OpenQuestion[] {
  const groups = groupsOf(cards);
  const order = areaOrder(groups);
  const ordered = groups
    .map((group, index) => ({ group, index }))
    .sort(
      (left, right) =>
        order.indexOf(left.group.area) - order.indexOf(right.group.area) ||
        right.group.dependents - left.group.dependents ||
        left.index - right.index,
    );
  return ordered.map(({ group }, position): OpenQuestion => {
    const [first] = group.cards;
    const options = optionsOf(first);
    return {
      cardId: first?.id ?? '',
      runKey,
      question: first?.question ?? first?.title ?? '',
      context: contextOf(group.cards),
      ...(options === undefined ? {} : { options }),
      ...(position < QUESTIONS_SHOWN ? {} : { more: true }),
    };
  });
}

/** RF-243, EV-57: the pairs of open questions of one run that were merged into one. */
export function mergedQuestionsOf(
  cards: readonly Card[],
  runKey: string,
): readonly MergedQuestion[] {
  return clustersOf(cards.filter((card) => card.type === 'OQ')).flatMap(([kept, ...rest]) =>
    kept === undefined
      ? []
      : rest.map((card) => ({
          ...{ keptCardId: kept.id, keptQuestion: kept.question ?? kept.title, keptRunKey: runKey },
          ...{ mergedCardId: card.id, mergedQuestion: card.question ?? card.title },
          mergedRunKey: runKey,
        })),
  );
}
