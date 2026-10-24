import { describe, expect, it } from 'vitest';
import { titlePhases } from '../../../../src/domain/planning/phase-titles.js';
import { planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-601, RF-627, P5-40: a phase is titled from the cards it holds. A planner name that shares no
// word with any card of the phase is replaced by the titles of its cards, and the change is noted.

function plan(names: readonly string[], tasks: Parameters<typeof planOf>[0]) {
  const base = planOf(tasks, names.length);
  return { ...base, phases: base.phases.map((phase, at) => ({ ...phase, name: names[at] ?? '' })) };
}

describe('titlePhases', () => {
  it('RF-627 P5-40 keeps a name that shares a word with a card of the phase', () => {
    const content = plan(['Marks'], [planTask({ title: 'Mark printing layout' })]);

    expect(titlePhases(content)).toBe(content);
  });

  it('RF-627 P5-40 titles a phase from its cards when the name matches none of them', () => {
    const content = plan(
      ['Marks', 'Services and fees'],
      [
        planTask({ id: 'T-001', phase: 1, title: 'Attendance register' }),
        planTask({ id: 'T-002', phase: 2, title: 'Mark bands' }),
        planTask({ id: 'T-003', phase: 2, title: 'Payment receipts' }),
      ],
    );

    const titled = titlePhases(content);

    expect(titled.phases.map((phase) => phase.name)).toEqual([
      'Attendance register',
      'Mark bands and Payment receipts',
    ]);
    expect(titled.phaseNotes).toEqual([
      { phase: 1, from: 'Marks', to: 'Attendance register' },
      { phase: 2, from: 'Services and fees', to: 'Mark bands and Payment receipts' },
    ]);
  });

  it('RF-627 P5-40 a phase with no card keeps its name', () => {
    const content = plan(['Later'], []);

    expect(titlePhases(content)).toBe(content);
  });

  it('RF-627 P5-40 more than three cards name the first three and count the rest', () => {
    const tasks = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((title, at) =>
      planTask({ id: `T-00${String(at + 1)}`, title }),
    );

    const titled = titlePhases(plan(['Zeta'], tasks));

    expect(titled.phases[0]?.name).toBe('Alpha, Beta, Gamma and 2 more');
  });
});

describe('titlePhases: names that fit', () => {
  it.each([
    ['API', 'Add API routes for orders'],
    ['Payments', 'Pay an invoice'],
    ['Setup', 'Set up the project'],
    ['Phase 1: Set up', 'Project setup'],
    ['Students', 'Student roster'],
  ])('RF-627 P5-40 keeps the name %s for the card %s', (name, title) => {
    const content = plan([name], [planTask({ title })]);

    expect(titlePhases(content)).toBe(content);
  });

  it('RF-627 P5-40 filler words do not make a name fit', () => {
    const content = plan(['Data from the start'], [planTask({ title: 'Mark data with bands' })]);

    expect(titlePhases(content).phases[0]?.name).toBe('Mark data with bands');
  });
});

describe('titlePhases: the migrations card', () => {
  it('RF-627 P5-40 the card code writes for the migrations does not name a phase', () => {
    const migrations = planTask({
      id: 'T-001',
      title: 'Write the database migrations in the chosen stack',
    });
    const content = plan(
      ['Orders'],
      [migrations, planTask({ id: 'T-002', title: 'Checkout flow' })],
    );

    expect(titlePhases(content).phases[0]?.name).toBe('Checkout flow');
  });

  it('RF-627 P5-40 a phase that holds only the migrations card keeps its name', () => {
    const migrations = planTask({
      id: 'T-001',
      title: 'Write the database migrations in the chosen stack',
    });
    const content = plan(['Orders'], [migrations]);

    expect(titlePhases(content)).toBe(content);
  });
});
