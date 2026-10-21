import type { Card } from '../../domain/cards/card.js';
import { applyMerges, MERGEABLE_TYPES, type MergeMoves } from '../../domain/cards/card-merge.js';
import type { CardType } from '../../domain/cards/card-vocabulary.js';
import type { RunScope } from '../ports/run-events.js';
import type { ConsolidationRecord, TaskResults } from '../ports/task-results.js';
import {
  consolidateCards,
  type Consolidation,
  type ConsolidationParts,
} from './consolidate-cards.js';

// RF-250, RF-006, P2-35, Q-52: the summariser step of an understand run that may be a resume. What an
// earlier session of the run did is in its consolidation record: the card types the summariser
// answered about (with the ids of the cards it was shown) and the merges it made. A resume makes
// those merges again, in order, so the card that survived keeps its id (answers.md keys on card
// ids), and asks only about a type it has not answered about or that has new cards, so nothing is
// paid twice.

/** What the step came to, and where the claims of the merges it made again went (Q-52, Deepen). */
export interface RunConsolidation extends Consolidation {
  readonly replayedMoves: readonly MergeMoves[];
}

export interface ConsolidationStore {
  readonly store: Pick<TaskResults, 'readConsolidation' | 'writeConsolidation'>;
  readonly scope: RunScope;
}

/** The types the record answered and whose cards are all ones it was shown. */
function answeredBefore(
  record: ConsolidationRecord,
  cards: readonly Card[],
): ReadonlySet<CardType> {
  const done = record.types.filter((entry) => {
    const shown = new Set(entry.cardIds);
    return cards.filter((card) => card.type === entry.type).every((card) => shown.has(card.id));
  });
  return new Set(done.map((entry) => entry.type));
}

/** The record after this session: the earlier entries, the types answered now, every merge made. */
function recordAfter(
  earlier: ConsolidationRecord,
  cards: readonly Card[],
  done: Pick<Consolidation, 'answered' | 'merges'>,
): ConsolidationRecord {
  const now = done.answered.map((type) => ({
    type,
    cardIds: cards.filter((card) => card.type === type).map((card) => card.id),
  }));
  const kept = earlier.types.filter((entry) => !done.answered.includes(entry.type));
  const types = [...kept, ...now].sort(
    (a, b) => MERGEABLE_TYPES.indexOf(a.type) - MERGEABLE_TYPES.indexOf(b.type),
  );
  return { types, merges: done.merges };
}

/**
 * The cards with the duplicates of several areas merged: the merges of the record again, then the
 * summariser's answers for the types not answered yet. The merges returned are all the cards now
 * stand for; the moves are those of the new merges only (the earlier session published its own).
 */
// RF-250, RF-006
export async function consolidateRun(
  parts: ConsolidationParts,
  where: ConsolidationStore,
  cards: readonly Card[],
): Promise<RunConsolidation> {
  const { store, scope } = where;
  const earlier = await store.readConsolidation(scope);
  const replayed = applyMerges(cards, earlier.merges);
  const skip = answeredBefore(earlier, cards);
  const asked = await consolidateCards(parts, replayed.cards, { skip });
  const merges = [...replayed.applied, ...asked.merges];
  const record = recordAfter(earlier, cards, { answered: asked.answered, merges });
  if (JSON.stringify(record) !== JSON.stringify(earlier)) {
    await store.writeConsolidation(scope, record);
  }
  return { ...asked, merges, replayedMoves: replayed.moves };
}
