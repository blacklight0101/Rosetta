import { describe, expect, it } from 'vitest';
import { behavioursToKeep } from '../../../../src/domain/planning/behaviours-to-keep.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-631, DEC-135, ADR-018: a task card names the behaviour of the legacy system it must not change:
// the supported claims, with their citations, of the FEAT, BR, FLOW and SCRN cards that the
// requirements it builds come from.

function card(id: string, type: SourceCard['type'], claims: readonly string[]): SourceCard {
  return {
    ...{ id, type, title: `Title ${id}`, summary: 'Summary.', area: 'orders' },
    claims: claims.map((text, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [{ path: `src/${id}.cs`, startLine: index + 1, endLine: index + 4 }],
      status: 'Supported',
    })),
  };
}

const sources = [
  card('BR-001', 'BR', ['Orders over 50 ship free.']),
  card('ENT-001', 'ENT', ['An order has lines.']),
  card('FEAT-001', 'FEAT', ['Checkout creates an order.', 'Checkout shows a total.']),
  card('FLOW-001', 'FLOW', ['Basket, checkout, confirmation.']),
  card('OQ-001', 'OQ', ['Cancel checks no role.']),
  card('SCRN-001', 'SCRN', ['The basket page lists lines.']),
];

const requirements = [
  { id: 'REQ-001', sources: ['FEAT-001'] },
  { id: 'REQ-002', sources: ['BR-001', 'FEAT-001'] },
  { id: 'REQ-003', sources: ['ENT-001', 'OQ-001'] },
  { id: 'REQ-004', sources: ['FLOW-001', 'SCRN-001'] },
];

function keptBy(ids: readonly string[]): string[] {
  const task = planTask({ requirements: ids });
  return behavioursToKeep(task, requirements, sources).map((each) => each.claimId);
}

describe('behavioursToKeep', () => {
  it('RF-631 lists every supported claim of the FEAT card a requirement comes from', () => {
    expect(keptBy(['REQ-001'])).toEqual(['FEAT-001.c1', 'FEAT-001.c2']);
  });

  it('RF-631 lists the behaviours of BR, FLOW and SCRN cards as well', () => {
    expect(keptBy(['REQ-002', 'REQ-004'])).toEqual([
      'BR-001.c1',
      'FEAT-001.c1',
      'FEAT-001.c2',
      'FLOW-001.c1',
      'SCRN-001.c1',
    ]);
  });

  it('RF-631 carries the card, the text and the citation of each behaviour', () => {
    const [first] = behavioursToKeep(
      planTask({ requirements: ['REQ-001'] }),
      requirements,
      sources,
    );

    expect(first).toEqual({
      cardId: 'FEAT-001',
      claimId: 'FEAT-001.c1',
      text: 'Checkout creates an order.',
      citations: [{ path: 'src/FEAT-001.cs', startLine: 1, endLine: 4 }],
    });
  });

  it('RF-631 lists the behaviours of a card once when two requirements name it', () => {
    expect(keptBy(['REQ-001', 'REQ-002'])).toEqual(['BR-001.c1', 'FEAT-001.c1', 'FEAT-001.c2']);
  });

  it('RF-631 lists nothing for a task that builds no feature, rule, flow or screen', () => {
    expect(keptBy(['REQ-003'])).toEqual([]);
    expect(keptBy([])).toEqual([]);
  });

  it('RF-631 ignores a requirement id the package does not know', () => {
    expect(keptBy(['REQ-099'])).toEqual([]);
  });
});
