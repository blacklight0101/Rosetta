import { transitionClaim, type Card, type ClaimInput } from '../../src/domain/cards/card.js';
import { assignCardIds, type TaskCards } from '../../src/domain/cards/card-ids.js';
import { extendCards, type CardExtension } from '../../src/domain/cards/card-extension.js';
import type { ClaimStatus } from '../../src/domain/cards/card-vocabulary.js';
import { draftOf } from './card-fixtures.js';

// P3-125: a parent card with claims of given statuses, and a Deepen task that extends it.

export const lines = (
  start: number,
  end: number,
): { path: string; startLine: number; endLine: number }[] => [
  { path: 'src/Orders/Order.cs', startLine: start, endLine: end },
];
export const verdict = {
  step: 'judgement',
  reason: 'r',
  model: 'm',
  at: '2026-10-23T00:00:00.000Z',
} as const;

/** ENT-001 with one claim per entry, each moved to the given status. */
export function parent(claims: readonly [string, ClaimStatus, ClaimInput['citations']][]): Card {
  const task: TaskCards = {
    agentTaskId: 'reader-001',
    area: 'orders',
    drafts: [
      draftOf({
        type: 'ENT',
        title: 'Order',
        claims: claims.map(([text, , citations]) => ({ text, citations })),
      }),
    ],
  };
  const made = assignCardIds([task]);
  if (!made.ok) throw new Error(made.error);
  let [card] = made.value;
  if (card === undefined) throw new Error('no card');
  for (const [index, [, status]] of claims.entries()) {
    if (status === 'Proposed') continue;
    const moved = transitionClaim(card, `ENT-001.c${String(index + 1)}`, status, verdict);
    if (!moved.ok) throw new Error(moved.error);
    card = moved.value;
  }
  return card;
}

export function deepen(
  card: Card,
  claims: ClaimInput[],
  replaceable: string[] = [],
  fileLines?: ReadonlyMap<string, number>,
): CardExtension {
  const task: TaskCards = {
    agentTaskId: 'reader-003',
    area: 'orders',
    extendable: [card.id],
    replaceable,
    drafts: [draftOf({ type: 'ENT', title: 'Order again', extends: card.id, claims })],
  };
  const extended = extendCards([task], [card], fileLines);
  if (!extended.ok) throw new Error(extended.error);
  return extended.value;
}
