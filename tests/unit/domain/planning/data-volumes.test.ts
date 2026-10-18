import { describe, expect, it } from 'vitest';
import { statedVolumes } from '../../../../src/domain/planning/data-volumes.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';

// RF-632, DEC-135: the volumes the cards state for the data, taken from the supported claims of the
// entity cards that give a quantity.

function card(id: string, type: SourceCard['type'], claims: readonly string[]): SourceCard {
  return {
    ...{ id, type, title: id, summary: 'Summary.', area: 'data' },
    claims: claims.map((text, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [{ path: 'db/schema.sql', startLine: 1, endLine: 2 }],
      status: 'Supported',
    })),
  };
}

describe('statedVolumes', () => {
  it('RF-632 lists the claims of an entity card that state a quantity of the data', () => {
    const volumes = statedVolumes([
      card('ENT-001', 'ENT', [
        'The Orders table holds about 2000000 rows.',
        'An order has lines and a status.',
        'The import adds 40000 records per day.',
        'An order has 12 columns.',
      ]),
    ]);

    expect(volumes.map((each) => each.claimId)).toEqual(['ENT-001.c1', 'ENT-001.c3']);
    expect(volumes[0]).toEqual({
      cardId: 'ENT-001',
      claimId: 'ENT-001.c1',
      text: 'The Orders table holds about 2000000 rows.',
      citations: [{ path: 'db/schema.sql', startLine: 1, endLine: 2 }],
    });
  });

  it('RF-632 reads a volume written with separators and in any letter case', () => {
    const volumes = statedVolumes([
      card('ENT-002', 'ENT', [
        'Holds 1,200,000 ROWS.',
        'Grows by 3 orders a day.',
        'Holds many rows.',
      ]),
    ]);

    expect(volumes.map((each) => each.claimId)).toEqual(['ENT-002.c1', 'ENT-002.c2']);
  });

  it('RF-632 leaves out the cards that are not about the data', () => {
    expect(statedVolumes([card('FEAT-001', 'FEAT', ['Exports 500 rows per day.'])])).toEqual([]);
  });

  it('RF-632 lists nothing when no card states a volume', () => {
    expect(statedVolumes([card('ENT-001', 'ENT', ['An order has lines.'])])).toEqual([]);
    expect(statedVolumes([])).toEqual([]);
  });
});
