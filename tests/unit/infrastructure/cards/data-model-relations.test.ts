import { describe, expect, it } from 'vitest';
import type { Card } from '../../../../src/domain/cards/card.js';
import { renderDataModel } from '../../../../src/infrastructure/cards/data-model-markdown.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { cardOf } from '../../../support/diagram-fixtures.js';

// RF-262, RF-508: data-model.md draws the relation a Supported ENT claim states, with unknown
// cardinality, lists it under "To confirm" and escapes entity names in the diagram.

const masker = new SecretMasker();
const render = (cards: readonly Card[]): string => renderDataModel(cards, cardSource, masker);

function lineCard(name: string, status: 'Supported' | 'Rejected'): Card {
  return cardOf({
    id: 'ENT-002',
    type: 'ENT',
    title: 'Basket line',
    claims: [
      {
        claimId: 'ENT-002.c2',
        text: `A basket line refers to ${name}.`,
        citations: [{ path: 'src/Orders/Checkout.cs', startLine: 10, endLine: 24 }],
        status,
      },
    ],
  });
}

describe('renderDataModel relations', () => {
  it('RF-262 draws a relation a Supported claim states with unknown cardinality and lists it to confirm', () => {
    const text = render([
      cardOf({ id: 'ENT-001', type: 'ENT', title: 'Catalog item' }),
      lineCard('a catalog item', 'Supported'),
    ]);

    expect(text).toContain(
      '  e2 }o..o{ e1 : "stated by ENT#45;002.c2 #40;cardinality unknown#41;"',
    );
    const confirm = text.slice(text.indexOf('## To confirm'));
    expect(confirm).toContain(
      String.raw`- ENT\-002 Basket line and ENT\-001 Catalog item (stated by ENT\-002.c2): cardinality unknown`,
    );
    expect(confirm).not.toContain('record no relations');
  });

  it('RF-262 draws nothing for a relation only a Rejected claim states', () => {
    const text = render([
      cardOf({ id: 'ENT-001', type: 'ENT', title: 'Catalog item' }),
      lineCard('a catalog item', 'Rejected'),
    ]);

    expect(text).not.toContain('..o{');
    expect(text).toContain('record no relations');
  });

  it('RF-508 an entity name cannot add Mermaid syntax or HTML to the diagram', () => {
    const name = 'Item"] x ||--|| y : "z <b>';
    const text = render([
      cardOf({ id: 'ENT-001', type: 'ENT', title: name }),
      lineCard(name, 'Supported'),
    ]);

    const diagram = text.slice(text.indexOf('```mermaid'), text.indexOf('## Entities'));
    expect(diagram.split('\n').filter((line) => line.includes(' : '))).toHaveLength(1);
    expect(diagram).not.toContain('x ||--|| y');
    expect(diagram).not.toContain('<b>');
  });
});
