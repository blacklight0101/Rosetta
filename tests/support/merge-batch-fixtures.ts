import type { Card } from '../../src/domain/cards/card.js';
import { assignCardIds } from '../../src/domain/cards/card-ids.js';
import { draftOf } from './card-fixtures.js';

// RF-250, P2-35: entity cards of two areas, each of about 140 tokens as the summariser is shown
// them, so a bound of 300 tokens holds two of them.

/** The bound of the tests: two of the cards below fit in it, three do not. */
export const SMALL_BOUND = 300;

/** `count` entity cards, ENT-001 (Orders), ENT-002 (Billing), ENT-003 (Orders), and so on. */
export function entities(count: number): readonly Card[] {
  const tasks = Array.from({ length: count }, (_, index) => ({
    agentTaskId: `reader-${String(index + 1).padStart(3, '0')}`,
    area: index % 2 === 0 ? 'Orders' : 'Billing',
    drafts: [
      draftOf({
        type: 'ENT',
        title: `Entity ${String(index + 1)}`,
        summary: 'x'.repeat(400),
        claims: [
          {
            text: `Entity ${String(index + 1)} is a table.`,
            citations: [{ path: `db/e${String(index + 1)}.sql`, startLine: 1, endLine: 4 }],
          },
        ],
      }),
    ],
  }));
  const cards = assignCardIds(tasks);
  if (!cards.ok) throw new Error('The batch fixture cards are invalid.');
  return cards.value;
}
