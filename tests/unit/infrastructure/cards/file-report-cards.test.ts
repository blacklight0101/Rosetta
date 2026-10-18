import { describe, expect, it } from 'vitest';
import { createCard, transitionClaim, type Card } from '../../../../src/domain/cards/card.js';
import { FileReportCards } from '../../../../src/infrastructure/cards/file-report-cards.js';
import { renderCardFile } from '../../../../src/infrastructure/cards/card-markdown.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';

// RF-502, data-model.md section 3.7: the card files of a run read for the pages of the report: the
// header is the data, so the claims come back with their status and the reason of their verdict. A
// file a person edited into something that does not read is left out, never half read.

const scope = scopeFor('20261012-100000-understand');
const folder = `projects/${scope.projectId}/runs/${scope.runKey}`;
const masker = new SecretMasker();

function cardWithVerdicts(): Card {
  const created = createCard({
    id: 'BR-001',
    type: 'BR',
    title: 'Free shipping',
    summary: 'Orders over 50 ship free.',
    area: 'orders',
    agentTaskId: 'task-orders',
    confidence: 'High',
    claims: [
      {
        text: 'Free over 50.',
        citations: [{ path: 'Orders/Shipping.cs', startLine: 10, endLine: 12 }],
      },
      {
        text: 'Gifts too.',
        citations: [
          { path: 'Orders/Gifts.cs', startLine: 1, endLine: 2 },
          { path: 'Orders/Shipping.cs', startLine: 30, endLine: 31 },
        ],
      },
    ],
    note: 'written without reading the area',
  });
  if (!created.ok) throw new Error('the card does not build');
  const verdict = (reason: string) =>
    ({ step: 'judgement', reason, model: 'fake', at: '2026-10-12T10:00:00.000Z' }) as const;
  const first = transitionClaim(created.value, 'BR-001.c1', 'Supported', verdict('It holds.'));
  if (!first.ok) throw new Error('the claim does not move');
  const second = transitionClaim(first.value, 'BR-001.c2', 'Rejected', verdict('No gift check.'));
  if (!second.ok) throw new Error('the claim does not move');
  return second.value;
}

function setup(files: Readonly<Record<string, string>>) {
  const writer = new MemoryOutputWriter();
  for (const [name, text] of Object.entries(files)) writer.files.set(`${folder}/${name}`, text);
  return new FileReportCards(writer);
}

const goodFile = renderCardFile(cardWithVerdicts(), cardSource, masker, []);

describe('FileReportCards', () => {
  it('RF-502 reads a card file back with its claims, citations, statuses and the reasons of the verdicts', async () => {
    const cards = setup({ 'cards/BR/BR-001.md': goodFile });

    expect(await cards.read(scope, ['cards/BR/BR-001.md'])).toEqual([
      {
        id: 'BR-001',
        type: 'BR',
        title: 'Free shipping',
        summary: 'Orders over 50 ship free.',
        area: 'orders',
        confidence: 'High',
        note: 'written without reading the area',
        claims: [
          {
            claimId: 'BR-001.c1',
            text: 'Free over 50.',
            status: 'Supported',
            reason: 'It holds.',
            citations: [{ path: 'Orders/Shipping.cs', startLine: 10, endLine: 12 }],
          },
          {
            claimId: 'BR-001.c2',
            text: 'Gifts too.',
            status: 'Rejected',
            reason: 'No gift check.',
            citations: [
              { path: 'Orders/Gifts.cs', startLine: 1, endLine: 2 },
              { path: 'Orders/Shipping.cs', startLine: 30, endLine: 31 },
            ],
          },
        ],
      },
    ]);
  });
});

describe('FileReportCards and other card shapes', () => {
  it('RF-502 reads a claim that was never judged without a reason', async () => {
    const created = createCard({
      id: 'BR-002',
      type: 'BR',
      title: 't',
      summary: 's',
      area: 'orders',
      agentTaskId: 'task-orders',
      confidence: 'Low',
      claims: [{ text: 'x', citations: [{ path: 'a.cs', startLine: 1, endLine: 1 }] }],
    });
    if (!created.ok) throw new Error('the card does not build');
    const cards = setup({
      'cards/BR/BR-002.md': renderCardFile(created.value, cardSource, masker, []),
    });

    const [card] = await cards.read(scope, ['cards/BR/BR-002.md']);

    expect(card?.claims[0]).toEqual({
      claimId: 'BR-002.c1',
      text: 'x',
      status: 'Proposed',
      citations: [{ path: 'a.cs', startLine: 1, endLine: 1 }],
    });
  });
});

describe('FileReportCards and the order of the cards', () => {
  it('RF-502 reads the question of an open question card', async () => {
    const created = createCard({
      id: 'OQ-001',
      type: 'OQ',
      title: 't',
      summary: 's',
      area: 'orders',
      agentTaskId: 'task-orders',
      confidence: 'Low',
      question: 'Is stock checked?',
      whyItMatters: 'It changes checkout.',
      claims: [{ text: 'x', citations: [{ path: 'a.cs', startLine: 1, endLine: 1 }] }],
    });
    if (!created.ok) throw new Error('the card does not build');
    const cards = setup({
      'cards/OQ/OQ-001.md': renderCardFile(created.value, cardSource, masker, []),
    });

    expect(await cards.read(scope, ['cards/OQ/OQ-001.md'])).toMatchObject([
      {
        question: 'Is stock checked?',
        whyItMatters: 'It changes checkout.',
        questionState: 'Open',
      },
    ]);
  });

  it('RF-502 keeps the order of the paths and leaves out a file that is missing', async () => {
    const other = goodFile.replaceAll('BR-001', 'BR-003');
    const cards = setup({ 'cards/BR/BR-001.md': goodFile, 'cards/BR/BR-003.md': other });

    const read = await cards.read(scope, [
      'cards/BR/BR-003.md',
      'cards/BR/BR-002.md',
      'cards/BR/BR-001.md',
    ]);

    expect(read.map((card) => card.id)).toEqual(['BR-003', 'BR-001']);
  });
});

describe('FileReportCards and files that do not read', () => {
  it('RF-502 leaves out a file whose header does not read, instead of half reading it', async () => {
    const broken = [
      'no header at all',
      '---\nid: "BR-001"\n---\n',
      goodFile.replace('status: "Supported"', 'status: "Maybe"'),
      goodFile.replace('Orders/Gifts.cs:1-2', 'not a citation'),
      goodFile.replace('Orders/Gifts.cs:1-2', '../../etc/passwd:1-2'),
      goodFile.replace('id: "BR-001"', 'id: "../x"'),
      '---\n: : :\n  - [\n---\n',
    ];

    for (const text of broken) {
      const cards = setup({ 'cards/BR/BR-001.md': text });

      expect(await cards.read(scope, ['cards/BR/BR-001.md'])).toEqual([]);
    }
  });

  it('RF-502 reads only card files of the run: a path that is not one is never opened', async () => {
    const writer = new MemoryOutputWriter();
    writer.files.set(`${folder}/spec.md`, goodFile);
    writer.files.set(`projects/${scope.projectId}/secret.md`, goodFile);
    const cards = new FileReportCards(writer);

    const read = await cards.read(scope, ['spec.md', '../../secret.md', 'cards/../spec.md', '']);

    expect(read).toEqual([]);
  });
});
