import type { Card } from '../../domain/cards/card.js';
import type { CardExtension } from '../../domain/cards/card-extension.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';
import type { CheckedCards } from '../verifier/citation-check.js';
import type { Consolidation } from '../consolidate/consolidate-cards.js';

/** The citation check of one claim as an event (RF-1002, RF-1004). */
async function announceCheck(
  events: RunEventPublisher,
  claim: Card['claims'][number],
  checked: CheckedCards,
  agentTaskId: string,
): Promise<void> {
  const check = checked.checks.find((each) => each.claimId === claim.claimId);
  if (check === undefined) return;
  const reason = check.reason === undefined ? {} : { reason: check.reason };
  // RF-1004: the text and cited lines let the live page list the claim without a card read.
  const shown = {
    text: claim.text,
    citations: claim.citations.map(({ path, startLine, endLine }) => ({
      path,
      startLine,
      endLine,
    })),
  };
  const data = { claimId: claim.claimId, ok: check.ok, ...reason, ...shown };
  await events.emit('verify.citation.checked', data, agentTaskId);
}

/** Publishes the given cards, with the citation check of each claim (RF-1002). */
export async function announceCards(
  events: RunEventPublisher,
  checked: CheckedCards,
  cards: readonly Card[],
): Promise<void> {
  for (const card of cards) {
    const { id: cardId, type, title, agentTaskId } = card;
    const claims = card.claims.length;
    await events.emit('agent.card.proposed', { cardId, type, title, claims }, agentTaskId);
    for (const claim of card.claims) await announceCheck(events, claim, checked, agentTaskId);
  }
}

/**
 * RF-209, DEC-158: the claims a Deepen task added to cards the parent run holds. The card is not
 * proposed again; each new claim is announced on its card id by its citation check, under the task
 * that wrote it, and the live page lists it with its card.
 */
export async function announceExtensions(
  events: RunEventPublisher,
  checked: CheckedCards,
  extension: CardExtension,
): Promise<void> {
  for (const { claimId, agentTaskId } of extension.claims) {
    const claim = checked.cards.flatMap((card) => card.claims).find((c) => c.claimId === claimId);
    if (claim !== undefined) await announceCheck(events, claim, checked, agentTaskId);
  }
}

/** RF-250, RF-1004: the merge renumbered claims; the pages move their verdicts by these events. */
export async function announceMerges(
  events: RunEventPublisher,
  merged: Consolidation,
): Promise<void> {
  for (const move of merged.moves) {
    const task = merged.cards.find((card) => card.id === move.cardId)?.agentTaskId;
    await events.emit('cards.merged', { ...move }, task);
  }
}

/**
 * P3-125, RF-209: how many claims a Deepen task wrote that the card already held, as
 * `agent.claims.replaced` under the task: `folded` into a claim that stands, `rejected` for a
 * restated rejected claim (kept, DEC-19). Published only for a task that has some.
 */
export async function announceReplaced(
  events: RunEventPublisher,
  extension: CardExtension,
): Promise<void> {
  const tasks = [...new Set(extension.replaced.map(({ agentTaskId }) => agentTaskId))];
  for (const agentTaskId of tasks) {
    const own = extension.replaced.filter((each) => each.agentTaskId === agentTaskId);
    const folded = own.filter(({ kind }) => kind === 'folded').length;
    const count = own.length;
    await events.emit(
      'agent.claims.replaced',
      { count, folded, rejected: count - folded },
      agentTaskId,
    );
  }
}
