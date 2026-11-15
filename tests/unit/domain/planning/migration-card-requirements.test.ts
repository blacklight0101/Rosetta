import { describe, expect, it } from 'vitest';
import {
  coverageOf,
  requirementItems,
  withMigrationCard,
} from '../../../../src/domain/planning/plan-coverage.js';
import { requirementsBuiltByNoCard } from '../../../../src/domain/planning/coverage-checks.js';
import { alignRequirements } from '../../../../src/domain/planning/requirement-alignment.js';
import type { PlanContent } from '../../../../src/domain/planning/plan-content.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import { coverageDocuments, planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P10-14, P10-D6, RF-627, RF-623: the migrations card keeps only the business rules that name its
// tables (RF-631), so it lists no requirement with a feature, journey or screen behind it. Such a
// requirement, listed by no other card, stays a gap item of the gap round instead of counting as built.

const requirement = (
  id: string,
  sources: readonly string[],
): PlanContent['requirements'][number] => ({
  ...{ id, title: `Title ${id}`, statement: 'A statement.' },
  sources: [...sources],
});

function plan(): PlanContent {
  const content = planOf([planTask({ id: 'T-001', title: 'Orders', requirements: [] })]);
  return {
    ...content,
    requirements: [
      requirement('REQ-001', ['ENT-001']),
      requirement('REQ-002', ['ENT-002', 'FEAT-009']),
      requirement('REQ-003', ['ENT-001', 'BR-004']),
      requirement('REQ-004', ['ENT-001', 'FLOW-002']),
      requirement('REQ-005', ['ENT-002', 'SCRN-003']),
    ],
  };
}

describe('the requirements of the migrations card (P10-14)', () => {
  const tables = targetModel().tables;

  it('RF-627 lists a requirement of its tables that cites only entity and rule cards', () => {
    const content = withMigrationCard(plan(), tables);

    expect(content.tasks[0]?.requirements).toEqual(['REQ-001', 'REQ-003']);
  });

  it('RF-627 lists no requirement that cites a FEAT, FLOW or SCRN card', () => {
    const content = withMigrationCard(plan(), tables);

    expect(content.tasks[0]?.requirements).not.toContain('REQ-002');
    expect(content.tasks[0]?.requirements).not.toContain('REQ-004');
    expect(content.tasks[0]?.requirements).not.toContain('REQ-005');
  });

  it('RF-627 a requirement with a feature behind it that only its tables reach is a gap item of the gap round', () => {
    const content = withMigrationCard(plan(), tables);

    const report = coverageOf(requirementItems(content.requirements), content.tasks);

    expect(report.uncovered.map((each) => each.id)).toEqual([
      'requirement:REQ-002',
      'requirement:REQ-004',
      'requirement:REQ-005',
    ]);
    expect(requirementsBuiltByNoCard(content).map((each) => each.id)).toEqual([
      'REQ-002',
      'REQ-004',
      'REQ-005',
    ]);
  });
});

describe('the migrations card after the requirement alignment (P10-14)', () => {
  const tables = targetModel().tables;

  it('RF-627 the requirement alignment gives the migrations card no requirement with a behaviour card behind it', () => {
    const content = withMigrationCard(plan(), tables);

    const aligned = alignRequirements(content, coverageDocuments());

    expect(aligned.tasks[0]?.requirements).toEqual(['REQ-001', 'REQ-003']);
    const report = coverageOf(requirementItems(aligned.requirements), aligned.tasks);
    expect(report.uncovered.map((each) => each.id)).toEqual([
      'requirement:REQ-002',
      'requirement:REQ-004',
      'requirement:REQ-005',
    ]);
  });

  it('RF-627 the alignment takes off a behaviour requirement the migrations card was given', () => {
    const content = withMigrationCard(plan(), tables);
    const [first, ...rest] = content.tasks;
    if (first === undefined) throw new Error('The plan has the migrations card.');
    const given = {
      ...content,
      tasks: [{ ...first, requirements: ['REQ-001', 'REQ-002'] }, ...rest],
    };

    const aligned = alignRequirements(given, coverageDocuments());

    expect(aligned.tasks[0]?.requirements).not.toContain('REQ-002');
  });
});
