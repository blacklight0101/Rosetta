import type { Card } from '../../src/domain/cards/card.js';
import type { ScreenDetail } from '../../src/domain/cards/flow-screen.js';
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

const invoiceFile = 'Invoice/Sheet1.txt';

/** Two cards of one type and one area, written by two reader tasks (Q-52): ids `<TYPE>-001`, `-002`. */
export function twoTasksOneArea(type: 'ENT' | 'FEAT' | 'SCRN' | 'BR'): readonly Card[] {
  const draft = (lines: [number, number]) =>
    draftOf({
      type,
      title: 'Invoice Table',
      area: 'Invoice',
      claims: [
        {
          text: `Invoice Table is described at line ${String(lines[0])}.`,
          citations: [{ path: invoiceFile, startLine: lines[0], endLine: lines[1] }],
        },
      ],
      ...(type === 'SCRN' ? { screen: invoiceScreen(lines[0]) } : {}),
    });
  const cards = assignCardIds([
    { agentTaskId: 'reader-001', area: 'Invoice', drafts: [draft([1, 5])] },
    { agentTaskId: 'reader-002', area: 'Invoice', drafts: [draft([10, 14])] },
  ]);
  if (!cards.ok) throw new Error('The merge fixture cards are invalid.');
  return cards.value;
}

/** One card type and one area but a single reader task: nothing to compare (Q-52). */
export function oneTaskTwoCards(type: 'ENT' | 'SCRN'): readonly Card[] {
  const draft = (lines: [number, number]) =>
    draftOf({
      type,
      title: 'Invoice Table',
      area: 'Invoice',
      claims: [
        {
          text: `Invoice Table at ${String(lines[0])}.`,
          citations: [{ path: invoiceFile, startLine: lines[0], endLine: lines[1] }],
        },
      ],
      ...(type === 'SCRN' ? { screen: invoiceScreen(lines[0]) } : {}),
    });
  const cards = assignCardIds([
    { agentTaskId: 'reader-001', area: 'Invoice', drafts: [draft([1, 5]), draft([10, 14])] },
  ]);
  if (!cards.ok) throw new Error('The merge fixture cards are invalid.');
  return cards.value;
}

/** The screen of the sheet: the first task sees an Email field, the second a Total field. */
function invoiceScreen(first: number): ScreenDetail {
  const second = first > 1;
  const name = second ? 'Total' : 'Email';
  return {
    route: 'Sheet1',
    roles: second ? ['Clerk'] : ['Admin'],
    fields: [
      {
        name,
        inputKind: 'text',
        required: second,
        validations: [
          {
            text: `${name} must be filled.`,
            citations: [{ path: invoiceFile, startLine: first + 2, endLine: first + 3 }],
          },
        ],
      },
    ],
    actions: [{ label: second ? 'Save' : 'Print', handler: second ? 'Save_Click' : 'Print_Click' }],
    leadsTo: [second ? 'Sheet3' : 'Sheet2'],
  };
}
