import type { Card } from '../../src/domain/cards/card.js';
import { assignCardIds } from '../../src/domain/cards/card-ids.js';
import { draftOf } from './card-fixtures.js';

// RF-250: cards of several areas, with ids given as a run gives them.

/** ENT-001 (Orders), BR-001 (Orders), ENT-002 (Billing), OQ-001 (Billing), in this order. */
export function cardsAcrossAreas(): readonly Card[] {
  const customer = draftOf({
    type: 'ENT',
    title: 'Customer',
    confidence: 'High',
    claims: [
      {
        text: 'A customer has an id and a name.',
        citations: [{ path: 'src/Orders/Customer.cs', startLine: 3, endLine: 12 }],
      },
    ],
  });
  const client = draftOf({
    type: 'ENT',
    title: 'Client',
    confidence: 'Medium',
    claims: [
      {
        text: 'The client table holds the billing name.',
        citations: [
          { path: 'src/Billing/Client.cs', startLine: 5, endLine: 9 },
          { path: 'db/clients.sql', startLine: 1, endLine: 6 },
        ],
      },
      {
        text: 'A client has an id.',
        citations: [{ path: 'src/Billing/Client.cs', startLine: 1, endLine: 4 }],
      },
    ],
  });
  const rule = draftOf({ type: 'BR', title: 'Free shipping over 50' });
  const question = draftOf({
    type: 'OQ',
    title: 'Who cancels?',
    confidence: 'Low',
    question: 'Which roles may cancel?',
    whyItMatters: 'Same rule in the new system.',
  });
  const cards = assignCardIds([
    { agentTaskId: 'reader-001', area: 'Orders', drafts: [customer, rule] },
    { agentTaskId: 'reader-002', area: 'Billing', drafts: [client, question] },
  ]);
  if (!cards.ok) throw new Error('The merge fixture cards are invalid.');
  return cards.value;
}

/** ENT-001 (Orders), ENT-002 (Billing) and ENT-003 (Orders again, or Shipping), one claim each. */
export function threeEntities(thirdArea: string): readonly Card[] {
  const entity = (title: string) =>
    draftOf({
      type: 'ENT',
      title,
      claims: [
        {
          text: `${title} is a table.`,
          citations: [{ path: `db/${title}.sql`, startLine: 1, endLine: 4 }],
        },
      ],
    });
  const cards = assignCardIds([
    { agentTaskId: 'reader-001', area: 'Orders', drafts: [entity('Customer')] },
    { agentTaskId: 'reader-002', area: 'Billing', drafts: [entity('Client')] },
    { agentTaskId: 'reader-003', area: thirdArea, drafts: [entity('Buyer')] },
  ]);
  if (!cards.ok) throw new Error('The merge fixture cards are invalid.');
  return cards.value;
}
