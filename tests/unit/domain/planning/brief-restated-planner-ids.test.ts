import { describe, expect, it } from 'vitest';
import { decideOnce, keptPlannerIds } from '../../../../src/domain/planning/brief-restated.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { DraftDecision } from '../../../../src/domain/planning/plan-draft.js';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// P9-15, RF-623, RF-608: the data model is checked against the planner's own decision records only,
// told from the records of the brief by the ids decideOnce gives the planner records it keeps, never
// by their titles (a brief record may carry the same title as one of the planner's).

const supported = new Set(['FEAT-001', 'BR-001']);

function decision(title: string, sources: string[] = []): DraftDecision {
  return {
    title,
    context: 'Context.',
    decision: 'Ids come from a sequence.',
    consequences: '',
    sources,
  };
}

function decided(decisions: DraftDecision[]) {
  const brief = {
    ...buildBrief({ architecture: { style: 'layered' } }, shippedCatalogue),
    savedAt: '2026-10-12T09:30:00.000Z',
  };
  const content = assemblePlan(
    {
      ...{ summary: 'A shop.', requirements: [], components: [], decisions, entities: [] },
      ...{ phases: [], tasks: [], risks: [] },
      technical: { integrations: [], security: [], targets: [], environments: [] },
    },
    supported,
  ).content;
  return decideOnce(content, brief, shippedCatalogue, { supported, cards: [] });
}

describe('the ids of the planner records decideOnce keeps', () => {
  it('RF-623 P9-15 are the first ids, one per record kept, whatever their titles', () => {
    const planner = [
      decision('Hi-lo ids generated in the application', ['BR-001']),
      decision('Adopt layered architecture'),
      decision('Migration strategy: Strangler Fig', ['BR-001']),
    ];

    const { content, restated } = decided(planner);
    const ids = keptPlannerIds(planner.length, restated.length);

    expect(restated).toHaveLength(1);
    expect(ids).toEqual(['ADR-001', 'ADR-002']);
    const kept = content.decisions.filter((each) => ids.includes(each.id));
    expect(kept.map((each) => each.title)).toEqual([
      'Hi-lo ids generated in the application',
      'Migration strategy: Strangler Fig',
    ]);
    const brief = content.decisions.filter((each) => !ids.includes(each.id));
    expect(brief.map((each) => each.title)).toContain('Migration strategy: Strangler Fig');
  });

  it('RF-623 P9-15 a plan whose records all restate the brief keeps none', () => {
    expect(keptPlannerIds(2, 2)).toEqual([]);
  });
});
