import { describe, expect, it } from 'vitest';
import { resolveCardAliases } from '../../../../src/domain/planning/card-aliases.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';

// P5-32, RF-601..RF-613: an id merged away resolves to the card that was kept.

function source(id: string, extra: Partial<SourceCard> = {}): SourceCard {
  return { id, type: 'SCRN', title: 't', summary: 's', area: 'a', claims: [], ...extra };
}

const step = (claimId: string, target: string) => ({
  ...{ claimId, text: 'Step.', citations: [], target },
  status: 'Supported' as const,
});

describe('P5-32 resolveCardAliases', () => {
  it('points a flow step at the kept card when it named a merged-away id', () => {
    const flow = source('FLOW-001', {
      type: 'FLOW',
      claims: [step('FLOW-001.c1', 'SCRN-002'), step('FLOW-001.c2', 'SCRN-009')],
    });
    const cards = [source('SCRN-001', { mergedFrom: ['SCRN-001', 'SCRN-002'] }), flow];

    const targets = resolveCardAliases(cards)[1]?.claims.map((claim) => claim.target);

    expect(targets).toEqual(['SCRN-001', 'SCRN-009']);
  });

  it('leaves cards that merged nothing as they are', () => {
    const cards = [source('SCRN-001')];

    expect(resolveCardAliases(cards)).toEqual(cards);
  });
});
