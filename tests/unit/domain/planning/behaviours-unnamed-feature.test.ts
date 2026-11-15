import { describe, expect, it } from 'vitest';
import {
  behavioursKeptByNoCard,
  behavioursOf,
} from '../../../../src/domain/planning/behaviours-to-keep.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P10-14, P10-D6, RF-631: a FEAT card that a requirement cites and that no feature of the PRD traces
// to is kept by the cards that list the requirement, whatever features they build. The narrowing of
// P5-41 still applies to a FEAT card some feature traces to, and to a FLOW card no journey traces to
// (a journey out of scope, left out with its reason).

function card(id: string, type: SourceCard['type'], claims: readonly string[]): SourceCard {
  return {
    ...{ id, type, title: `Title ${id}`, summary: 'Summary.', area: 'catalog' },
    claims: claims.map((text, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [{ path: `src/${id}.cs`, startLine: index + 1, endLine: index + 2 }],
      status: 'Supported',
    })),
  };
}

const sources = [
  card('FEAT-001', 'FEAT', ['The list shows ten items a page.']),
  card('FEAT-002', 'FEAT', ['The detail page shows the price.']),
  card('FEAT-003', 'FEAT', ['The picture falls back to a placeholder.', 'Pictures are PNG.']),
  card('FLOW-001', 'FLOW', ['Browse to detail.']),
  card('FLOW-004', 'FLOW', ['Export to a spreadsheet.']),
];

const requirements = [
  { id: 'REQ-001', sources: ['FEAT-001', 'FEAT-002', 'FEAT-003'] },
  { id: 'REQ-002', sources: ['FLOW-001', 'FLOW-004'] },
];

// F-001 traces to FEAT-001, F-002 to FEAT-002; no feature traces to FEAT-003. FLOW-004 is out of scope.
const scope = new Map([
  ['feature:F-001', ['FEAT-001']],
  ['feature:F-002', ['FEAT-002']],
  ['flow:FLOW-001', ['FLOW-001']],
]);

const kept = (task: ReturnType<typeof planTask>): string[] =>
  behavioursOf(task, requirements, sources, { scope }).keep.map((each) => each.claimId);

describe('a FEAT card no feature traces to (P10-14)', () => {
  it('RF-631 a task that builds another feature keeps the claims of a cited card no feature traces to', () => {
    const task = planTask({ id: 'T-005', requirements: ['REQ-001'], builds: ['feature:F-001'] });

    expect(kept(task)).toEqual(['FEAT-001.c1', 'FEAT-003.c1', 'FEAT-003.c2']);
  });

  it('RF-631 a cited card that a feature traces to is still narrowed to the task that builds that feature', () => {
    const task = planTask({ id: 'T-005', requirements: ['REQ-001'], builds: ['feature:F-001'] });

    expect(kept(task)).not.toContain('FEAT-002.c1');
  });

  it('RF-631 a FLOW card no journey traces to is still narrowed away from a task that builds a journey', () => {
    const task = planTask({ id: 'T-006', requirements: ['REQ-002'], builds: ['flow:FLOW-001'] });

    expect(kept(task)).toEqual(['FLOW-001.c1']);
  });

  it('RF-631 the claims of a cited card no feature traces to are not listed as kept by no card', () => {
    const tasks = [
      planTask({ id: 'T-005', requirements: ['REQ-001'], builds: ['feature:F-001'] }),
      planTask({ id: 'T-007', requirements: ['REQ-001'], builds: ['feature:F-002'] }),
    ];

    const lost = behavioursKeptByNoCard(tasks, requirements, sources, { scope });

    expect(lost.map((each) => each.claimId)).toEqual([]);
  });

  it('RF-631 the migrations card still keeps no feature claim, so a requirement only it lists loses them', () => {
    const migrations = planTask({
      ...{ id: 'T-002', title: 'Write the database migrations in the chosen stack' },
      requirements: ['REQ-001'],
    });

    const lost = behavioursKeptByNoCard([migrations], requirements, sources, { scope });

    expect(lost.map((each) => each.claimId)).toEqual([
      'FEAT-001.c1',
      'FEAT-002.c1',
      'FEAT-003.c1',
      'FEAT-003.c2',
    ]);
  });
});
