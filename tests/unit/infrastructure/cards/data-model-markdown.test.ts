import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../../support/render-markdown.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import type { EntityModel } from '../../../../src/domain/diagrams/entity-diagram.js';
import { renderDataModel } from '../../../../src/infrastructure/cards/data-model-markdown.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { cardOf } from '../../../support/diagram-fixtures.js';

// RF-262: data-model.md lists every entity once with its claims (fields, keys, relations) and
// their citations, the generated ER diagram and a "to confirm" list; model text stays literal.

const masker = new SecretMasker();
const link = (range: string, lines: string): string =>
  `[src/Orders/Checkout.cs:${range}](https://github.com/octo/demo/blob/${cardSource.commitSha.value}/src/Orders/Checkout.cs#${lines})`;

function entity(id: string, title: string, overrides: Partial<Card> = {}): Card {
  return cardOf({ id, type: 'ENT', title, ...overrides });
}

const render = (cards: readonly Card[], model?: EntityModel): string =>
  renderDataModel(cards, cardSource, masker, model);

const headings = (text: string): string[] => text.split('\n').filter((l) => l.startsWith('### '));

const twoEntities: EntityModel['entities'] = [
  { cardId: 'ENT-001', name: 'Customer', fields: [] },
  { cardId: 'ENT-002', name: 'Order', fields: [] },
];

describe('renderDataModel part 1', () => {
  it('RF-262 writes the diagram, each entity with its claim and citation, and the to-confirm list', () => {
    const text = render([entity('ENT-001', 'Customer'), entity('ENT-002', 'Order')]);

    expect(text).toBe(
      [
        '# Legacy data model',
        '',
        'The entities of the legacy application as its entity cards state them. Each line cites the code it came from.',
        '',
        '## Entity diagram',
        '',
        '```mermaid',
        'erDiagram',
        '  e1["Customer"]',
        '  e2["Order"]',
        '```',
        '',
        '## Entities',
        '',
        '### ENT-001 Customer ([card file](cards/ENT/ENT-001.md))',
        '',
        '> A card.',
        '',
        'Area: orders | Confidence: High',
        '',
        'Fields, keys and relations as the card states them:',
        '',
        `- ENT-001.c1 [Supported] x (${link('10-24', 'L10-L24')})`,
        '',
        '### ENT-002 Order ([card file](cards/ENT/ENT-002.md))',
        '',
        '> A card.',
        '',
        'Area: orders | Confidence: High',
        '',
        'Fields, keys and relations as the card states them:',
        '',
        `- ENT-002.c1 [Supported] x (${link('10-24', 'L10-L24')})`,
        '',
        '## To confirm',
        '',
        '- The entity cards record no relations between entities, so none is drawn. Confirm which entities are related and how many of each take part.',
        '',
      ].join('\n'),
    );
  });
});

describe('renderDataModel part 2', () => {
  it('RF-262 lists every ENT card exactly once, however the cards are ordered', () => {
    const cards = [
      entity('ENT-003', 'Line'),
      entity('ENT-001', 'Customer'),
      cardOf({ id: 'BR-001', type: 'BR', title: 'A rule' }),
      entity('ENT-002', 'Order'),
    ];

    const text = render(cards);

    expect(headings(text).map((line) => line.slice(4, 11))).toEqual([
      'ENT-001',
      'ENT-002',
      'ENT-003',
    ]);
    expect(text).not.toContain('BR-001');
  });

  it('RF-262 a merged entity appears once with every citation and the ids it was merged from', () => {
    const cite = (startLine: number, endLine: number) => [
      { path: 'src/Orders/Checkout.cs', startLine, endLine },
    ];
    const merged = entity('ENT-001', 'Customer', {
      mergedFrom: ['ENT-004', 'ENT-007'],
      claims: [
        {
          claimId: 'ENT-001.c1',
          text: 'Has an e-mail.',
          citations: cite(10, 24),
          status: 'Supported',
        },
        {
          claimId: 'ENT-001.c2',
          text: 'Has a name.',
          citations: cite(30, 31),
          status: 'Supported',
        },
      ],
    });

    const text = render([merged]);

    expect(headings(text)).toHaveLength(1);
    expect(text).toContain(String.raw`Merged from: ENT-004, ENT-007`);
    expect(text).toContain(link('10-24', 'L10-L24'));
    expect(text).toContain(link('30-31', 'L30-L31'));
    expect(text).not.toContain('### ENT-004');
  });
});

describe('renderDataModel part 3', () => {
  it('ADR-005 a rejected or citation-invalid claim stays in the file, marked', () => {
    const card = entity('ENT-001', 'Customer', {
      claims: [
        { claimId: 'ENT-001.c1', text: 'Made up.', citations: [], status: 'Rejected' },
        { claimId: 'ENT-001.c2', text: 'Bad lines.', citations: [], status: 'CitationInvalid' },
      ],
    });

    const text = render([card]);

    const lines = text.split('\n');
    expect(lines).toContain('- ENT-001.c1 [Rejected] Made up.');
    expect(lines).toContain('- ENT-001.c2 [CitationInvalid] Bad lines.');
  });

  it('RF-262 a cardinality the cards do not state is drawn as unknown and listed to confirm', () => {
    const model: EntityModel = {
      entities: twoEntities,
      relations: [
        {
          from: 'ENT-001',
          to: 'ENT-002',
          label: 'places',
          fromCardinality: 'one',
          toCardinality: 'unknown',
        },
        {
          from: 'ENT-002',
          to: 'ENT-001',
          label: 'belongs to',
          fromCardinality: 'zero-or-more',
          toCardinality: 'one',
        },
      ],
    };

    const text = render([entity('ENT-001', 'Customer'), entity('ENT-002', 'Order')], model);

    expect(text).toContain('  e1 ||..o{ e2 : "places #40;cardinality unknown#41;"');
    expect(text).toContain('  e2 }o--|| e1 : "belongs to"');
    const toConfirm = text.split('## To confirm')[1] ?? '';
    expect(toConfirm).toContain(String.raw`ENT-001 Customer and ENT-002 Order (places)`);
    expect(toConfirm).not.toContain('belongs to');
  });
});

describe('renderDataModel part 4', () => {
  it('RF-262 when every stated relation is complete, nothing is left to confirm', () => {
    const model: EntityModel = {
      entities: twoEntities,
      relations: [
        {
          from: 'ENT-001',
          to: 'ENT-002',
          label: 'places',
          fromCardinality: 'one',
          toCardinality: 'zero-or-more',
        },
      ],
    };

    const text = render([entity('ENT-001', 'Customer'), entity('ENT-002', 'Order')], model);

    expect(text).toContain('## To confirm\n\n- Nothing is left to confirm.');
  });

  it('RF-507 hostile entity text stays literal and cannot end the fence or add a statement', () => {
    const hostile =
      'end ```\n```mermaid\nclick a href "javascript:x" <script>x</script> [a](http://evil.example)';
    const card = entity('ENT-001', hostile, {
      summary: hostile,
      claims: [{ claimId: 'ENT-001.c1', text: hostile, citations: [], status: 'Supported' }],
    });

    const text = render([card]);

    expect(text.split('\n').filter((line) => line.startsWith('```'))).toEqual([
      '```mermaid',
      '```',
    ]);
    expect(dangerousIn(text)).toBeUndefined();
    expect(text).not.toContain('](http://evil');
    const diagram = text.split('```mermaid\n')[1]?.split('\n```')[0] ?? '';
    expect(diagram.split('\n')).toHaveLength(2);
    expect(diagram).not.toMatch(/javascript:|`/);
  });
});

describe('renderDataModel part 5', () => {
  it('RF-141 a secret in an entity title is masked in the diagram and the body', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';

    const text = render([entity('ENT-001', `Key ${secret}`)]);

    expect(text).not.toContain(secret);
    expect(text).toContain('MASKED');
  });

  it('RF-141 a secret with characters the diagram escapes is masked before it is escaped', () => {
    const text = render([entity('ENT-001', 'password: hunter2-secret!')]);

    expect(text).not.toContain('hunter2');
  });
});
