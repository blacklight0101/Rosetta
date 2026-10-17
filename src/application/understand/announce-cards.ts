import type { Card } from '../../domain/cards/card.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';
import type { CheckedCards } from '../verifier/citation-check.js';

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
    for (const claim of card.claims) {
      const check = checked.checks.find((each) => each.claimId === claim.claimId);
      if (check === undefined) continue;
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
  }
}
