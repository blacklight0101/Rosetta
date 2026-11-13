import { describe, expect, it } from 'vitest';
import {
  coverageOf,
  requirementItemId,
  requirementItems,
  withBuiltRequirements,
} from '../../../../src/domain/planning/plan-coverage.js';
import { planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-627, P9-06, EV-108: a requirement that no task card lists is an item built by no card.

const content = planOf([
  planTask({ id: 'T-001', requirements: ['REQ-001'], builds: [] }),
  planTask({ id: 'T-002', requirements: [], builds: ['requirement:REQ-002', 'feature:F-001'] }),
]);

describe('requirement items', () => {
  it('RF-627 P9-06 makes one item per requirement with its title and statement', () => {
    expect(requirementItems(content.requirements)).toEqual([
      { id: 'requirement:REQ-001', kind: 'requirement', name: 'Orders', detail: 'Place an order.' },
      { id: 'requirement:REQ-002', kind: 'requirement', name: 'Mail', detail: 'Send mail.' },
    ]);
    expect(requirementItemId('REQ-020')).toBe('requirement:REQ-020');
  });

  it('RF-627 P9-06 a requirement a card lists is built, the others are uncovered', () => {
    const items = requirementItems(content.requirements);
    const only = [planTask({ id: 'T-001', requirements: ['REQ-001'], builds: [] })];

    const report = coverageOf(items, only);

    expect(report.uncovered.map((each) => each.id)).toEqual(['requirement:REQ-002']);
    expect(report.modules).toEqual([]);
  });

  it('RF-627 P9-06 a card that builds requirement:REQ-n lists it and keeps only document items', () => {
    const moved = withBuiltRequirements(content);

    expect(moved.tasks[1]?.requirements).toEqual(['REQ-002']);
    expect(moved.tasks[1]?.builds).toEqual(['feature:F-001']);
    expect(moved.tasks[0]).toBe(content.tasks[0]);
    const report = coverageOf(requirementItems(moved.requirements), moved.tasks);
    expect(report.uncovered).toEqual([]);
  });

  it('RF-627 P9-06 a requirement id the plan does not have is dropped, never listed', () => {
    const odd = planOf([
      planTask({ id: 'T-001', requirements: [], builds: ['requirement:REQ-099'] }),
    ]);

    const moved = withBuiltRequirements(odd);

    expect(moved.tasks[0]?.requirements).toEqual([]);
    expect(moved.tasks[0]?.builds).toEqual([]);
  });

  it('RF-627 P9-06 a plan with no requirement card id is returned as it is', () => {
    const plain = planOf([planTask({ id: 'T-001', requirements: ['REQ-001'], builds: [] })]);

    expect(withBuiltRequirements(plain)).toBe(plain);
  });
});
