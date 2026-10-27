import { describe, expect, it } from 'vitest';
import type { ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';
import { scoreClaims } from '../../../../src/domain/eval/claim-score.js';
import { claim, finding } from '../../../support/eval-fixtures.js';

// RF-262, RFC-001 section 7: the noun "reference type" is not a relation between entities; the verb
// "references type X" is one. The cases pin each word of the exclusion and each verb form.

const relations = [
  finding({
    id: 'relation-line-item',
    kind: 'relation',
    of: 'Basket line',
    cardTypes: ['ENT'],
    evidence: ['Services/OrderService.cs:9-10'],
    keywords: ['item'],
  }),
];

function entity(id: string, text: string, citation: string, status: ClaimStatus = 'Supported') {
  return claim({
    claimId: id,
    cardType: 'ENT',
    cardTitle: 'Basket line',
    text,
    status,
    citations: [citation],
  });
}

describe('a reference type is not a relation', () => {
  it('RF-262 does not read "reference type" as a relation between entities', () => {
    const claims = [
      entity(
        'ENT-001.c1',
        'The class is generic over TEntity, which must be a reference type.',
        'Services/OrderService.cs:9-10',
      ),
    ];

    expect(scoreClaims(claims, relations, [])).toMatchObject({ relationsStated: 0 });
  });

  it.each([
    'The parameter must be a reference type.',
    'The parameter must be an reference type.',
    'The parameter must be the reference type.',
    'The parameter which is reference type.',
    'The parameter must be reference types.',
    'The parameter which is this reference type.',
    'The parameter which is that reference type.',
    'The parameters which are these reference types.',
    'The parameters which are those reference types.',
    'The parameter has its reference type.',
    'The parameter has their reference types.',
    'The parameter has each reference type.',
    'The parameter has every reference type.',
    'The parameter has any reference types.',
    'The parameter has some reference types.',
    'The parameter has our reference type.',
    'The parameter has your reference type.',
    'The parameter has his reference type.',
    'The parameter has her reference type.',
    'The parameter has my reference type.',
    'Reference types are not allowed.',
    'Value types and reference types differ.',
    'Value types or reference types differ.',
    'Value types, reference types and enums differ.',
    'Each parameter is generic. Reference types are excluded.',
  ])('RF-262 does not read the noun in "%s" as a relation', (text) => {
    const claims = [entity('ENT-001.c1', text, 'Services/OrderService.cs:9-10')];

    expect(scoreClaims(claims, relations, [])).toMatchObject({ relationsStated: 0 });
  });
});

describe('the verb reference is a relation word', () => {
  it.each([
    'Catalog items reference a catalog brand and a catalog type.',
    'Service methods operate on CatalogItem and reference CatalogBrand and CatalogType.',
    'The item references CatalogBrand.',
    'A basket line is referenced by an order.',
    'The item references type CatalogType.',
    'Items reference types of brand.',
    'The item references a type of catalog.',
    'Entities that reference types of brand are listed.',
    'Value types and items reference types.',
    'Items reference types and reference CatalogBrand.',
  ])('RF-262 counts "%s" as a relation stated', (text) => {
    const claims = [entity('ENT-001.c1', text, 'Services/OrderService.cs:9-10')];

    expect(scoreClaims(claims, relations, [])).toMatchObject({ relationsStated: 1 });
  });

  it.each([
    'must be a reference type',
    'must be a reference types',
    'must be a reference-type',
    'is a reference type',
    'the reference type',
    'must be reference-typed',
  ])('RF-262 does not read "%s" as a relation', (phrase) => {
    const text = `The class is generic over TEntity, which ${phrase}.`;
    const claims = [entity('ENT-001.c1', text, 'Services/OrderService.cs:9-10')];

    expect(scoreClaims(claims, relations, [])).toMatchObject({ relationsStated: 0 });
  });
});
