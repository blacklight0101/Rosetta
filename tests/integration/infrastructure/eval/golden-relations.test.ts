import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scoreClaims } from '../../../../src/domain/eval/claim-score.js';
import { loadGoldenSet } from '../../../../src/infrastructure/eval/golden-set-file.js';
import { claim } from '../../../support/eval-fixtures.js';

// RNF-006, RF-262, P2-47: the live evaluation of 2026-10-25 measured the relation precision of the
// entity cards at 0.000 because the readers did write relations ("foreign key to ...") but the
// shipped golden set held no relation finding, so every relation stated was counted wrong. These
// claims are trimmed from the entity cards that evaluation wrote (the public eShopModernizing demo
// only); the shipped golden set must score them.

const evalFolder = fileURLToPath(new URL('../../../../eval/', import.meta.url));
const models = 'eShopLegacyWebFormsSolution/src/eShopLegacyWebForms/Models';

const recorded = [
  claim({
    claimId: 'ENT-001.c6',
    cardType: 'ENT',
    cardTitle: 'Catalog item, brand and type',
    text: 'Column Catalog.CatalogBrandId: int, NOT NULL, foreign key to CatalogBrand.Id (required relationship).',
    citations: [`${models}/CatalogDBContext.cs:79-81`],
  }),
  claim({
    claimId: 'ENT-001.c7',
    cardType: 'ENT',
    cardTitle: 'Catalog item, brand and type',
    text: 'Column Catalog.CatalogTypeId: int, NOT NULL, foreign key to CatalogType.Id (required relationship).',
    citations: [`${models}/CatalogDBContext.cs:83-85`],
  }),
  claim({
    claimId: 'ENT-005.c1',
    cardType: 'ENT',
    cardTitle: 'Paginated items view model',
    text: 'The class is generic over TEntity, which must be a reference type, and exposes ActualPage and Data with private setters.',
    citations: [
      'eShopLegacyWebFormsSolution/src/eShopLegacyWebForms/ViewModel/PaginatedItemsViewModel.cs:6-16',
    ],
  }),
];

describe('the relations of the shipped golden set', () => {
  it('RF-262 RNF-006 holds the relations of a catalog item to its brand and its type', async () => {
    const loaded = await loadGoldenSet(evalFolder, 'golden/eshop-webforms.json');
    expect(loaded.ok ? '' : loaded.error).toBe('');
    if (!loaded.ok) return;

    const relations = loaded.value.set.cases
      .flatMap((entry) => entry.findings)
      .filter((finding) => finding.kind === 'relation');

    expect(relations.map((relation) => relation.id)).toEqual([
      'relation-item-brand',
      'relation-item-type',
    ]);
    expect(relations.every((relation) => relation.of === 'Catalog item')).toBe(true);
  });

  it('RF-262 RNF-006 scores the relations the readers wrote as correct', async () => {
    const loaded = await loadGoldenSet(evalFolder, 'golden/eshop-webforms.json');
    if (!loaded.ok) throw new Error(loaded.error);
    const findings = loaded.value.set.cases.flatMap((entry) => entry.findings);

    const score = scoreClaims(recorded, findings, []);

    expect(score.relationClaims).toEqual(['ENT-001.c6', 'ENT-001.c7']);
    expect(score).toMatchObject({
      relationsStated: 2,
      relationsCorrect: 2,
      relationPrecision: 1,
    });
  });
});
