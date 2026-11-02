import { describe, expect, it } from 'vitest';
import { DEPLOYMENT_ITEM } from '../../../../src/domain/planning/module-coverage.js';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import { addGapTasks, type GapDraft } from '../../../../src/domain/planning/plan-gap.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { draftTask } from '../../../support/task-card-fixtures.js';

// P8-06, RF-607, EV-32: under SDD a gap card for a module of the source or its deployment material
// is kept even when no source card is behind it (the understand run never read the WinForms client,
// say): the doubtful case keeps the card, with each item noted as one that needs a requirement. A
// module whose source cards a requirement cites gets that requirement, like any gap card (P7-14).

const desk: CoverageItem = { id: 'module:src/Desk', kind: 'module', name: 'src/Desk', detail: '' };
const orders: CoverageItem = {
  ...{ id: 'module:src/Orders', kind: 'module', name: 'src/Orders' },
  detail: '',
};
const ship: CoverageItem = { id: DEPLOYMENT_ITEM, kind: 'deployment', name: 'D', detail: '' };
const bare: CoverageItem = { id: 'flow:FLOW-009', kind: 'flow', name: 'Bare', detail: '' };
const gaps = [desk, orders, ship, bare];

// REQ-001 cites ENT-001 (planOf); the desk module and the deployment have no source card.
const itemSources = new Map<string, ReadonlySet<string>>([
  ['module:src/Desk', new Set<string>()],
  ['module:src/Orders', new Set(['ENT-001'])],
  [DEPLOYMENT_ITEM, new Set<string>()],
]);

function gapDraft(builds: string[]): GapDraft {
  return { ...draftTask(), requirements: [], builds };
}

describe('addGapTasks: module cards under SDD (P8-06)', () => {
  const sdd = { specificationDriven: true, itemSources };

  it('RF-607 keeps a card for a module or the deployment with no source card, and notes them', () => {
    const drafts = [gapDraft(['module:src/Desk']), gapDraft([DEPLOYMENT_ITEM])];

    const result = addGapTasks(planOf(twoTasks()), drafts, gaps, sdd);

    expect(result.leftOut).toEqual([]);
    expect(result.content.tasks.slice(2).map((task) => task.builds)).toEqual([
      ['module:src/Desk'],
      [DEPLOYMENT_ITEM],
    ]);
    expect(result.content.requirementNotes).toEqual([
      { kind: 'unbacked', task: 'T-003', item: 'module:src/Desk' },
      { kind: 'unbacked', task: 'T-004', item: DEPLOYMENT_ITEM },
    ]);
  });

  it('RF-607 a module card takes the requirements that cite the source cards of the module', () => {
    const result = addGapTasks(planOf(twoTasks()), [gapDraft(['module:src/Orders'])], gaps, sdd);

    expect(result.content.tasks[2]?.requirements).toEqual(['REQ-001']);
  });

  it('RF-607 a card of the documents with nothing to derive is still left out', () => {
    const result = addGapTasks(planOf(twoTasks()), [gapDraft(['flow:FLOW-009'])], gaps, sdd);

    expect(result.leftOut.map((each) => each.field)).toEqual(['requirements']);
  });

  it('RF-601 a gap card that only changes new CI and Docker files builds no legacy deployment', () => {
    const draft = { ...gapDraft([]), files: ['Dockerfile', '.github/workflows/ci.yml'] };

    const result = addGapTasks(planOf(twoTasks()), [draft], gaps, sdd);

    expect(result.leftOut.map((each) => each.field)).toEqual(['builds']);
    expect(result.content.tasks).toHaveLength(2);
  });

  it('RF-601 without SDD a module card is kept with no requirement and no note', () => {
    const result = addGapTasks(planOf(twoTasks()), [gapDraft(['module:src/Desk'])], gaps, {
      itemSources,
    });

    expect(result.content.tasks[2]?.builds).toEqual(['module:src/Desk']);
    expect(result.content.requirementNotes).toBeUndefined();
  });
});
