import { describe, expect, it } from 'vitest';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import {
  addGapTasks as addGapTasksReporting,
  type GapDraft,
} from '../../../../src/domain/planning/plan-gap.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { draftTask, planTask } from '../../../support/task-card-fixtures.js';

// RF-627, RF-630, Q-45: the task cards the planner adds for the items no card builds. The answer
// is untrusted: a card is kept only when it is a card an agent can build without guessing, sits in
// a phase that exists and builds an item that really is a gap. Its id follows the last card.

const flow: CoverageItem = { id: 'flow:FLOW-007', kind: 'flow', name: 'Refund', detail: '' };
const screen: CoverageItem = { id: 'screen:SCRN-004', kind: 'screen', name: 'Refunds', detail: '' };
const gaps = [flow, screen];

type Args = Parameters<typeof addGapTasksReporting>;

/** The plan with the cards added; what is left out is tested in plan-gap-left-out.test.ts. */
function addGapTasks(...args: Args) {
  return addGapTasksReporting(...args).content;
}

function gapDraft(overrides: Partial<GapDraft> = {}): GapDraft {
  return { ...draftTask(), builds: ['flow:FLOW-007'], ...overrides };
}

describe('addGapTasks', () => {
  it('RF-627 numbers a new card after the last and links the gap it builds', () => {
    const content = planOf(twoTasks());

    const merged = addGapTasks(content, [gapDraft()], gaps);

    expect(merged.tasks.map((task) => task.id)).toEqual(['T-001', 'T-002', 'T-003']);
    expect(merged.tasks[2]).toMatchObject({
      title: 'Orders',
      phase: 1,
      requirements: ['REQ-001'],
      builds: ['flow:FLOW-007'],
      identifiers: [],
    });
    expect(merged.tasks.slice(0, 2)).toEqual(content.tasks);
  });

  it('RF-627 numbers several new cards in the order of the answer', () => {
    const merged = addGapTasks(
      planOf(twoTasks()),
      [gapDraft({ title: 'One' }), gapDraft({ title: 'Two', builds: ['screen:SCRN-004'] })],
      gaps,
    );

    expect(merged.tasks.slice(2).map((task) => [task.id, task.title])).toEqual([
      ['T-003', 'One'],
      ['T-004', 'Two'],
    ]);
  });

  it('RF-627 a build that is no gap is dropped: a covered item, an invented id, a name', () => {
    const merged = addGapTasks(
      planOf(twoTasks()),
      [gapDraft({ builds: ['feature:F-001', 'flow:FLOW-099', 'Refund', 'screen:SCRN-004'] })],
      gaps,
    );

    expect(merged.tasks[2]?.builds).toEqual(['screen:SCRN-004']);
  });

  it('RF-627 the builds of a card are in the order of the gaps, each once', () => {
    const merged = addGapTasks(
      planOf(twoTasks()),
      [gapDraft({ builds: ['screen:SCRN-004', 'flow:FLOW-007', 'screen:SCRN-004'] })],
      gaps,
    );

    expect(merged.tasks[2]?.builds).toEqual(['flow:FLOW-007', 'screen:SCRN-004']);
  });
});

describe('addGapTasks: what a card builds', () => {
  it('RF-627 a card that builds no gap is not added', () => {
    const merged = addGapTasks(
      planOf(twoTasks()),
      [gapDraft({ builds: ['feature:F-001', 'nothing'] }), gapDraft({ builds: [] })],
      gaps,
    );

    expect(merged.tasks).toHaveLength(2);
  });
});

describe('addGapTasks: what is a card', () => {
  it('RF-630 a card in a phase that does not exist is not added', () => {
    const merged = addGapTasks(
      planOf(twoTasks()),
      [gapDraft({ phase: 2 }), gapDraft({ phase: 0 })],
      gaps,
    );

    expect(merged.tasks).toHaveLength(2);
  });

  it('RF-630 a card that is not a card an agent can build is not added', () => {
    const noInvariant = gapDraft({ invariant: '  ' });
    const noScenario = gapDraft({ acceptanceCriteria: ['Show the refund page.'] });
    const noProbes = gapDraft({ adds: ['check'], probes: [] });
    const noRisk = { ...gapDraft(), riskClass: undefined };

    const merged = addGapTasks(
      planOf(twoTasks()),
      [noInvariant, noScenario, noProbes, noRisk],
      gaps,
    );

    expect(merged.tasks).toHaveLength(2);
  });

  it('RF-630 a card at a risk with review probes is added', () => {
    const merged = addGapTasks(
      planOf(twoTasks()),
      [gapDraft({ riskClass: 'money', probes: ['A refund of 0.'] })],
      gaps,
    );

    expect(merged.tasks[2]).toMatchObject({ riskClass: 'money', probes: ['A refund of 0.'] });
  });
});

describe('addGapTasks: requirements and order', () => {
  it('RF-607 given SDD a card that implements no requirement is not added; otherwise it is', () => {
    const draft = gapDraft({ requirements: [] });
    const plain = addGapTasks(planOf(twoTasks()), [draft], gaps);
    const specified = addGapTasks(planOf(twoTasks()), [draft], gaps, { specificationDriven: true });

    expect(plain.tasks).toHaveLength(3);
    expect(specified.tasks).toHaveLength(2);
  });

  it('RF-601 a requirement position that does not exist implements nothing', () => {
    const merged = addGapTasks(planOf(twoTasks()), [gapDraft({ requirements: [2, 9, 0] })], gaps);

    expect(merged.tasks[2]?.requirements).toEqual(['REQ-002']);
  });

  it('RF-634 a card waits for the new cards it names that come before it, and for a card it shares files with', () => {
    const existing = [
      planTask({ id: 'T-001', files: ['src/refunds/'] }),
      planTask({ id: 'T-002' }),
    ];

    const merged = addGapTasks(
      planOf(existing),
      [
        gapDraft({ title: 'One', files: ['src/refunds/'] }),
        gapDraft({ title: 'Two', builds: ['screen:SCRN-004'], dependsOn: [1, 2, 9] }),
      ],
      gaps,
    );

    expect(merged.tasks[2]?.dependsOn).toEqual(['T-001']);
    expect(merged.tasks[3]?.dependsOn).toEqual(['T-003']);
  });

  it('RF-627 with no draft the plan is returned as it is', () => {
    const content = planOf(twoTasks());

    expect(addGapTasks(content, [], gaps)).toEqual(content);
  });
});

describe('addGapTasks: what a gap card waits for', () => {
  it('RF-627 P5-40 a gap card may wait for any card already written, named by its id', () => {
    const merged = addGapTasks(
      planOf(twoTasks()),
      [gapDraft({ dependsOn: ['T-001', 'T-002', 'T-099', 1] })],
      gaps,
    );

    expect(merged.tasks[2]?.dependsOn).toEqual(['T-001', 'T-002']);
  });

  it('RF-627 P5-40 a card in an earlier phase does not wait for a card of a later phase', () => {
    const later = planTask({ id: 'T-002', title: 'Later', phase: 2 });
    const merged = addGapTasks(
      planOf([planTask({ id: 'T-001', title: 'First' }), later], 2),
      [gapDraft({ phase: 1, dependsOn: ['T-002'] })],
      gaps,
    );

    expect(merged.tasks[2]?.dependsOn).toEqual([]);
  });
});
