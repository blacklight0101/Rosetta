import { err, ok, type Result } from '../errors/result.js';
import type { Card } from './card.js';
import { mergedScreen } from './screen-merge.js';
import { CONFIDENCES, type CardType, type Confidence } from './card-vocabulary.js';

// RF-250, ADR-005, Q-52: cards that describe the same entity, rule, screen or feature become one
// card, whether they came from several areas or from two reader tasks of one area.
// The merged card keeps every claim (with its citations, status and verdict) of the cards it
// replaces, so nothing is lost and a rejected claim stays rejected (RF-302); the merge is recorded
// in `mergedFrom`. The card keeps the id, area and task of the first of the merged cards in card
// order, so the ids of the other cards do not change and a rerun gives the same ids.

/**
 * The types consolidation looks at, in the order it asks: rules, entities, screens, features
 * (RF-250, Q-52). `FLOW` cards are not merged: a flow is a journey, and two journeys that look
 * alike are two journeys.
 */
export const MERGEABLE_TYPES: readonly CardType[] = ['BR', 'ENT', 'SCRN', 'FEAT'];

/** What the summariser asked for: the cards to merge and the text of the merged card. */
export interface CardMerge {
  readonly ids: readonly string[];
  readonly title: string;
  readonly summary: string;
}

type MergeProblem =
  'too-few-cards' | 'unknown-card' | 'repeated-card' | 'type-differs' | 'type-not-mergeable';

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

/** Q-52: the merged screen holds every field, action, validation, role and link of the screens. */
function screenOf(members: readonly Card[]): Pick<Card, 'screen'> {
  const screens = members.flatMap((card) => (card.screen === undefined ? [] : [card.screen]));
  const merged = mergedScreen(screens);
  return merged === undefined ? {} : { screen: merged };
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
    ...(first.type === 'SCRN' ? screenOf(members) : {}),
  };
}

/** The claims whose id the merge changed: the merged card's claims, in order, against the old ones. */
function movesOf(members: readonly Card[], merged: Card): MergeMoves {
  const before = members.flatMap((card) => card.claims.map((claim) => claim.claimId));
  const claims = merged.claims.flatMap((claim, index) => {
    const from = before[index];
    return from === undefined || from === claim.claimId ? [] : [{ from, to: claim.claimId }];
  });
  return { cardId: merged.id, from: members.map((card) => card.id), claims };
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
 * or repeated id, other types, a type that is not mergeable) is skipped with its reason.
 */
export function applyMerges(cards: readonly Card[], merges: readonly CardMerge[]): MergeResult {
  let current = cards;
  const applied: CardMerge[] = [];
  const moves: MergeMoves[] = [];
  const skipped: { merge: CardMerge; problem: MergeProblem }[] = [];
  for (const merge of merges) {
    const members = membersOf(current, merge);
    if (!members.ok) {
      skipped.push({ merge, problem: members.error });
      continue;
    }
    const merged = mergedCard(members.value, merge);
    current = replaced(current, members.value, merged);
    applied.push(merge);
    moves.push(movesOf(members.value, merged));
  }
  return { cards: current, applied, moves, skipped };
}
