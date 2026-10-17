import { err, ok, type Result } from '../errors/result.js';
import type { Card } from './card.js';
import { CONFIDENCES, type CardType, type Confidence } from './card-vocabulary.js';

// RF-250, ADR-005: cards of several areas that describe the same entity or rule become one card.
// The merged card keeps every claim (with its citations, status and verdict) of the cards it
// replaces, so nothing is lost and a rejected claim stays rejected (RF-302); the merge is recorded
// in `mergedFrom`. The card keeps the id, area and task of the first of the merged cards in card
// order, so the ids of the other cards do not change and a rerun gives the same ids.

/** The types consolidation looks at, in the order it asks: rules, then entities (RF-250). */
export const MERGEABLE_TYPES: readonly CardType[] = ['BR', 'ENT'];

/** What the summariser asked for: the cards to merge and the text of the merged card. */
export interface CardMerge {
  readonly ids: readonly string[];
  readonly title: string;
  readonly summary: string;
}

type MergeProblem =
  | 'too-few-cards'
  | 'unknown-card'
  | 'repeated-card'
  | 'type-differs'
  | 'type-not-mergeable'
  | 'one-area';

/** Where the claims of one applied merge went: `from` is the id before, `to` the id in the merged card. */
export interface MergeMoves {
  readonly cardId: string;
  readonly from: readonly string[];
  readonly claims: readonly { readonly from: string; readonly to: string }[];
}

export interface MergeResult {
  readonly cards: readonly Card[];
  readonly applied: readonly CardMerge[];
  readonly moves: readonly MergeMoves[];
  readonly skipped: readonly { readonly merge: CardMerge; readonly problem: MergeProblem }[];
}

/** The areas a card stands for: those of the cards it absorbed, or its own. */
function areasOf(card: Card): readonly string[] {
  return card.mergedAreas ?? [card.area];
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function membersOf(
  cards: readonly Card[],
  merge: CardMerge,
): Result<readonly Card[], MergeProblem> {
  if (merge.ids.length < 2) return err('too-few-cards');
  if (new Set(merge.ids).size !== merge.ids.length) return err('repeated-card');
  const members = cards.filter((card) => merge.ids.includes(card.id));
  if (members.length !== merge.ids.length) return err('unknown-card');
  const [first] = members;
  if (first === undefined) return err('too-few-cards');
  if (members.some((card) => card.type !== first.type)) return err('type-differs');
  if (!MERGEABLE_TYPES.includes(first.type)) return err('type-not-mergeable');
  if (new Set(members.flatMap(areasOf)).size < 2) return err('one-area');
  return ok(members);
}

/** The lowest of the confidences: a merge is no surer than its least sure card. */
function lowestConfidence(cards: readonly Card[]): Confidence {
  const rank = (confidence: Confidence): number => CONFIDENCES.indexOf(confidence);
  return cards.reduce<Confidence>(
    (lowest, card) => (rank(card.confidence) > rank(lowest) ? card.confidence : lowest),
    'High',
  );
}

function mergedCard(members: readonly Card[], merge: CardMerge): Card {
  const [first] = members;
  if (first === undefined) throw new Error('A merge has at least two cards.');
  const claims = members
    .flatMap((card) => card.claims)
    .map((claim, index) => ({ ...claim, claimId: `${first.id}.c${String(index + 1)}` }));
  return {
    ...first,
    title: merge.title,
    summary: merge.summary,
    confidence: lowestConfidence(members),
    claims,
    mergedFrom: unique(members.flatMap((card) => card.mergedFrom ?? [card.id])),
    mergedAreas: unique(members.flatMap(areasOf)),
  };
}

function replaced(cards: readonly Card[], members: readonly Card[], merged: Card): Card[] {
  const gone = new Set(members.map((card) => card.id));
  return cards.flatMap((card) => {
    if (card.id === merged.id) return [merged];
    return gone.has(card.id) ? [] : [card];
  });
}

/**
 * Applies the merges one after the other. A merge that is not valid for the cards left (unknown
 * or repeated id, other types, one area, a type that is not mergeable) is skipped with its reason.
 */
export function applyMerges(cards: readonly Card[], merges: readonly CardMerge[]): MergeResult {
  let current = cards;
  const applied: CardMerge[] = [];
  const skipped: { merge: CardMerge; problem: MergeProblem }[] = [];
  for (const merge of merges) {
    const members = membersOf(current, merge);
    if (!members.ok) {
      skipped.push({ merge, problem: members.error });
      continue;
    }
    current = replaced(current, members.value, mergedCard(members.value, merge));
    applied.push(merge);
  }
  return { cards: current, applied, moves: [], skipped };
}
