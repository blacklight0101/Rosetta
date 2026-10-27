import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CARD_TYPES, CLAIM_STATUSES } from '../../../../src/domain/cards/card-vocabulary.js';
import { scoreClaims } from '../../../../src/domain/eval/claim-score.js';
import { loadGoldenSet } from '../../../../src/infrastructure/eval/golden-set-file.js';
import { claim } from '../../../support/eval-fixtures.js';

// RNF-006, RF-262, P2-47: the live evaluation of 2026-10-25 measured the relation precision of the
// entity cards at 0.000 because the readers did write relations ("foreign key to ...", "reference
// CatalogBrand ...") but the shipped golden set held no relation finding, so every relation stated
// was counted wrong. The claims are the real ones of that run (tests/fixtures/eval/README.md); the
// shipped golden set must score them.

const evalFolder = fileURLToPath(new URL('../../../../eval/', import.meta.url));
const fixture = new URL('../../../fixtures/eval/p2-47-ent-claims.json', import.meta.url);

const recordedSchema = z.object({
  claims: z.array(
    z.object({
      claimId: z.string(),
      cardType: z.enum(CARD_TYPES),
      cardTitle: z.string(),
      text: z.string(),
      status: z.enum(CLAIM_STATUSES),
      citations: z.array(z.string()),
    }),
  ),
});

async function recorded() {
  const parsed = recordedSchema.parse(JSON.parse(await readFile(fixture, 'utf8')));
  return parsed.claims.map((entry) => claim(entry));
}

async function findings() {
  const loaded = await loadGoldenSet(evalFolder, 'golden/eshop-webforms.json');
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.value.set.cases.flatMap((entry) => entry.findings);
}

describe('the relations of the shipped golden set', () => {
  it('RF-262 RNF-006 holds the relations of a catalog item to its brand and its type', async () => {
    const relations = (await findings()).filter((finding) => finding.kind === 'relation');

    expect(relations.map((relation) => relation.id)).toEqual([
      'relation-item-brand',
      'relation-item-type',
    ]);
    expect(relations.every((relation) => relation.of === 'Catalog item')).toBe(true);
  });

  it('RF-262 RNF-006 states the relation claims of the live run and scores the two keys correct', async () => {
    const score = scoreClaims(await recorded(), await findings(), []);

    // The reference type claim is not a relation, the rejected claim is not Supported.
    expect(score.relationClaims).toEqual(['ENT-001.c18', 'ENT-001.c6', 'ENT-001.c7']);
    expect(score).toMatchObject({ relationsStated: 3, relationsCorrect: 2 });
    expect(score.relationPrecision).toBeCloseTo(2 / 3, 5);
  });
});
