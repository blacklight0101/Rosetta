import { describe, expect, it } from 'vitest';
import {
  nothingToDerive,
  settleDerivedRequirements,
  withoutTasks,
} from '../../../../src/domain/planning/derived-requirements.js';
import { coverageDocuments, planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P8-02, RF-607, RF-627: once the cards are linked, a package card kept to derive its requirements
// takes them from what it builds; one with nothing to derive is left out, and the others are
// numbered again and keep waiting for what it waited for.

const documents = coverageDocuments();

describe('settleDerivedRequirements', () => {
  it('P8-02 RF-607 a card that builds an item cited by a requirement takes it, with a note', () => {
    const base = planOf([
      planTask({ id: 'T-001', requirements: [], builds: ['feature:F-001'], derives: 1 }),
    ]);
    const content = {
      ...base,
      requirements: [
        ...base.requirements,
        { id: 'REQ-003', title: 'Order', statement: 'Order.', sources: ['FEAT-001'] },
      ],
    };

    const settled = settleDerivedRequirements(content, documents);

    expect(settled.leftOut).toEqual([]);
    expect(settled.content.tasks).toEqual([
      expect.objectContaining({ id: 'T-001', requirements: ['REQ-003'] }),
    ]);
    expect(settled.content.tasks[0]).not.toHaveProperty('derives');
    expect(settled.content.requirementNotes).toContainEqual({
      kind: 'added',
      task: 'T-001',
      requirement: 'REQ-003',
    });
  });

  it('P8-02 RF-607 a card whose items no requirement cites is kept, each item noted', () => {
    const content = planOf([
      planTask({ id: 'T-001', requirements: [], builds: ['feature:F-002'], derives: 1 }),
    ]);

    const settled = settleDerivedRequirements(content, documents);

    expect(settled.content.tasks).toMatchObject([{ id: 'T-001', requirements: [] }]);
    expect(settled.content.requirementNotes).toContainEqual({
      kind: 'unbacked',
      task: 'T-001',
      item: 'feature:F-002',
    });
  });
});

describe('settleDerivedRequirements: what is kept and what is left out', () => {
  it('P8-02 RF-607 a card that already has requirements from the links only loses its mark', () => {
    const content = planOf([planTask({ id: 'T-001', requirements: ['REQ-001'], derives: 1 })]);

    const settled = settleDerivedRequirements(content, documents);

    expect(settled.content.tasks).toEqual([expect.objectContaining({ requirements: ['REQ-001'] })]);
    expect(settled.content.tasks[0]).not.toHaveProperty('derives');
  });

  it('P8-02 RF-607 a card with nothing to derive is left out by its answer position', () => {
    const content = planOf([
      planTask({ id: 'T-001', title: 'Orders' }),
      planTask({ id: 'T-002', title: 'Bare', requirements: [], derives: 4, dependsOn: ['T-001'] }),
      planTask({ id: 'T-003', title: 'Mail', dependsOn: ['T-002'] }),
    ]);

    const settled = settleDerivedRequirements(content, documents);

    expect(settled.leftOut).toEqual([{ position: 4, ...nothingToDerive }]);
    expect(settled.content.tasks).toMatchObject([
      { id: 'T-001', title: 'Orders' },
      { id: 'T-002', title: 'Mail', dependsOn: ['T-001'] },
    ]);
  });

  it('P8-02 a plan with no card to settle is returned as it is', () => {
    const content = planOf([planTask()]);

    expect(settleDerivedRequirements(content, documents).content).toBe(content);
  });
});

describe('withoutTasks', () => {
  it('P8-02 renames the notes of the cards kept and drops the notes of the cards left out', () => {
    const content = {
      ...planOf([planTask({ id: 'T-001' }), planTask({ id: 'T-002' })]),
      requirementNotes: [
        { kind: 'none' as const, task: 'T-001' },
        { kind: 'none' as const, task: 'T-002' },
      ],
    };

    const without = withoutTasks(content, new Set(['T-001']));

    expect(without.tasks).toMatchObject([{ id: 'T-001' }]);
    expect(without.requirementNotes).toEqual([{ kind: 'none', task: 'T-001' }]);
  });
});
