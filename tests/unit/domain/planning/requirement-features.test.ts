import { describe, expect, it } from 'vitest';
import { coverageItems, coverageOf } from '../../../../src/domain/planning/plan-coverage.js';
import { withRequirementFeatures } from '../../../../src/domain/planning/requirement-features.js';
import { coverageDocuments, planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-627, P5-40: a card gains the features of the requirements it lists, the way it gains the
// requirements today. A card that lists REQ-011, whose source card is the one behind feature F-006,
// builds F-006 even when the gap model left the id out of `builds`.

function content(tasks: Parameters<typeof planOf>[0]) {
  const base = planOf(tasks);
  return {
    ...base,
    requirements: [
      { id: 'REQ-001', title: 'People', statement: 'Manage people.', sources: ['FEAT-002'] },
      {
        ...{ id: 'REQ-002', title: 'Orders', statement: 'Place orders.' },
        sources: ['FEAT-001', 'ENT-001'],
      },
    ],
  };
}

describe('withRequirementFeatures', () => {
  it('RF-627 P5-40 a card listing a requirement gains the feature whose source card the requirement cites', () => {
    const plan = content([
      planTask({ id: 'T-001', requirements: ['REQ-001'], builds: ['screen:SCRN-001'] }),
    ]);

    const gained = withRequirementFeatures(plan, coverageDocuments());

    expect(gained.tasks[0]?.builds).toEqual(['feature:F-002', 'screen:SCRN-001']);
  });

  it('RF-627 P5-40 the feature is then covered, and an item no requirement leads to stays uncovered', () => {
    const documents = coverageDocuments();
    const plan = content([
      planTask({ id: 'T-001', requirements: ['REQ-001'], builds: ['screen:SCRN-001'] }),
    ]);

    const gained = withRequirementFeatures(plan, documents);

    const uncovered = coverageOf(coverageItems(documents), gained.tasks).uncovered;
    expect(uncovered.map((item) => item.id)).not.toContain('feature:F-002');
    expect(uncovered.map((item) => item.id)).toContain('feature:F-001');
  });

  it('RF-627 P5-40 a card that builds nothing gains nothing, as with its requirements', () => {
    const plan = content([planTask({ id: 'T-001', requirements: ['REQ-001'], builds: [] })]);

    expect(withRequirementFeatures(plan, coverageDocuments())).toEqual(plan);
  });
});

describe('withRequirementFeatures: what is left alone', () => {
  it('RF-627 P5-40 a requirement that is not in the plan builds nothing', () => {
    const plan = content([
      planTask({ id: 'T-001', requirements: ['REQ-099'], builds: ['screen:SCRN-001'] }),
    ]);

    expect(withRequirementFeatures(plan, coverageDocuments()).tasks[0]?.builds).toEqual([
      'screen:SCRN-001',
    ]);
  });

  it('RF-627 P5-40 the card that writes the migrations gains no feature through its requirements', () => {
    const migration = planTask({
      ...{ id: 'T-001', title: 'Write the database migrations in the chosen stack' },
      requirements: ['REQ-002'],
      builds: ['table:customer'],
    });

    const gained = withRequirementFeatures(content([migration]), coverageDocuments());

    expect(gained.tasks[0]?.builds).toEqual(['table:customer']);
  });

  it('RF-627 P5-40 a card that already builds the feature is not changed', () => {
    const plan = content([
      planTask({ id: 'T-001', requirements: ['REQ-001'], builds: ['feature:F-002'] }),
    ]);

    expect(withRequirementFeatures(plan, coverageDocuments())).toEqual(plan);
  });
});
