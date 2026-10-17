import { describe, expect, it } from 'vitest';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { overviewMessage } from '../../../../src/application/overview/overview-request.js';
import { mergeMessage } from '../../../../src/application/consolidate/merge-request.js';
import { fakePassword } from '../../../support/continuation-breaks.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { freshTag } from '../../../support/data-block-tags.js';
import { egressHarness, requestWith } from '../../../support/egress-harness.js';

// RF-141, RF-145, RNF-003, P2-42: the cards the summariser reads are JSON text, in which a quote
// inside a claim is escaped; a rule for a quoted secret must still see the claim as it was written.

const quoted = `Password="${fakePassword.slice(0, 4)}\\"${fakePassword.slice(4)}"`;

function cardsWith(text: string) {
  const assigned = assignCardIds([
    {
      agentTaskId: 'task-1',
      area: 'orders',
      drafts: [
        draftOf({
          summary: text,
          claims: [{ text, citations: [{ path: 'src/A.cs', startLine: 1, endLine: 2 }] }],
        }),
        draftOf({ title: 'Other', area: 'orders' }),
      ],
    },
  ]);
  if (!assigned.ok) throw new Error('fixture');
  return assigned.value;
}

async function sentFor(content: string): Promise<string> {
  const { guard, fake } = await egressHarness();
  await guard.complete(requestWith([{ role: 'user', content }]));
  return JSON.stringify(fake.requests);
}

describe('EgressGuard and the cards as JSON', () => {
  it('RF-141 masks a quoted secret with an escaped quote in the overview message', async () => {
    const sent = await sentFor(overviewMessage(cardsWith(quoted), freshTag()));

    expect(sent).not.toContain(fakePassword.slice(4));
    expect(sent).toContain('[MASKED:password]');
  });

  it('RF-141 masks a quoted secret with an escaped quote in the merge message', async () => {
    const message = mergeMessage(cardsWith(quoted), 'FEAT', freshTag());

    expect(await sentFor(message)).not.toContain(fakePassword.slice(4));
  });

  it('RF-141 keeps the lines of the cards message in place', async () => {
    const message = overviewMessage(cardsWith(quoted), freshTag());
    const { guard, fake } = await egressHarness();

    await guard.complete(requestWith([{ role: 'user', content: message }]));

    const sent = fake.requests[0]?.messages[0]?.content ?? '';
    expect(sent.split('\n').length).toBe(message.split('\n').length);
  });
});

describe('EgressGuard and the cards in another JSON layout', () => {
  it.each([
    ['compact', (text: string): string => JSON.stringify(JSON.parse(text))],
    ['four spaces', (text: string): string => JSON.stringify(JSON.parse(text), null, 4)],
    [
      'CRLF',
      (text: string): string => JSON.stringify(JSON.parse(text), null, 2).replaceAll('\n', '\r\n'),
    ],
  ])('RF-141 masks a quoted secret with an escaped quote in %s JSON', async (_name, reshape) => {
    const message = overviewMessage(cardsWith(quoted), freshTag());
    const lines = message.split('\n');
    const body = lines.slice(1, -1).join('\n');

    const sent = await sentFor([lines[0], reshape(body), lines.at(-1)].join('\n'));

    expect(sent).not.toContain(fakePassword.slice(4));
  });
});
