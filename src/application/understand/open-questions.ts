import type { Card } from '../../domain/cards/card.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { OpenQuestion, SuggestedOption } from '../ports/answers-file.js';

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

/** "Who uses these pages?" and "who uses these pages" are the same question; '' when no words. */
export function questionWords(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function keyOf(card: Card): string {
  const words = questionWords(card.question ?? card.title);
  return words === '' ? `card:${card.id}` : words;
}

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

function groupsOf(cards: readonly Card[]): readonly Group[] {
  const questions = cards.filter((card) => card.type === 'OQ');
  const others = cards.filter((card) => card.type !== 'OQ');
  const byKey = new Map<string, Card[]>();
  for (const card of questions) byKey.set(keyOf(card), [...(byKey.get(keyOf(card)) ?? []), card]);
  return [...byKey.values()].map((group) => ({
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
  return ordered.map(({ group }): OpenQuestion => {
    const [first] = group.cards;
    const options = optionsOf(first);
    return {
      cardId: first?.id ?? '',
      runKey,
      question: first?.question ?? first?.title ?? '',
      context: contextOf(group.cards),
      ...(options === undefined ? {} : { options }),
    };
  });
}
