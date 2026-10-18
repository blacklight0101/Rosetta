import { describe, expect, it } from 'vitest';
import {
  coverageItems,
  coverageOf,
  linkTasks,
  withMigrationCard,
  type CoverageItem,
} from '../../../../src/domain/planning/plan-coverage.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import {
  coverageDocuments,
  featureOnlyDocuments,
  planOf,
  twoTasks,
} from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-627, RF-623: which items of the package a task card builds. Coverage is by link (the id of
// the item), never by the words of a title.

const ids = (items: readonly CoverageItem[]): string[] => items.map((item) => item.id);

const sortedIds = (items: readonly CoverageItem[]): string[] => ids(items).sort(kindThenId);

const kinds = ['feature', 'table', 'operation', 'flow', 'screen'];

function kindThenId(a: string, b: string): number {
  const byKind = kinds.indexOf(a.split(':')[0] ?? '') - kinds.indexOf(b.split(':')[0] ?? '');
  if (byKind !== 0) return byKind;
  return a < b ? -1 : a > b ? 1 : 0;
}

describe('coverageItems', () => {
  it('RF-627 lists every feature, table, operation, flow and screen, kind by kind', () => {
    const items = coverageItems(coverageDocuments());

    expect(ids(items)).toEqual([
      'feature:F-001',
      'feature:F-002',
      'table:customer',
      'table:customer_order',
      'operation:listCustomers',
      'operation:listOrders',
      'operation:placeOrder',
      'operation:getOrder',
      'operation:cancelOrder',
      'operation:signIn',
      'flow:FLOW-001',
      'screen:SCRN-001',
      'screen:SCRN-003',
    ]);
  });

  it('RF-627 a journey out of scope and a dropped legacy screen are not items', () => {
    const items = coverageItems(coverageDocuments());

    expect(ids(items)).not.toContain('flow:FLOW-002');
    expect(ids(items)).not.toContain('screen:SCRN-004');
  });
});

describe('coverageItems: what is not an item', () => {
  it('RF-627 a package without a contract has no operation item', () => {
    const items = coverageItems(featureOnlyDocuments());

    expect(ids(items)).toEqual(['feature:F-001', 'feature:F-002']);
  });

  it('RF-627 an operation named twice is one item', () => {
    const documents = coverageDocuments();
    if (documents.apiContract.kind !== 'openapi') throw new Error('The fixture has a contract');
    const [first] = documents.apiContract.operations;
    if (first === undefined) throw new Error('The fixture has operations');
    const twice = {
      ...documents,
      apiContract: { ...documents.apiContract, operations: [first, first] },
    };

    expect(ids(coverageItems(twice)).filter((id) => id.startsWith('operation:'))).toEqual([
      'operation:listCustomers',
    ]);
  });
});

describe('linkTasks', () => {
  const items = coverageItems(coverageDocuments());

  it('RF-627 keeps the ids the planner linked to each task, in the order of the items', () => {
    const draft = {
      links: [
        { task: 1, builds: ['screen:SCRN-001', 'feature:F-001'] },
        { task: 2, builds: ['table:customer'] },
      ],
    };

    const linked = linkTasks(twoTasks(), draft, items);

    expect(linked.map((task) => task.builds)).toEqual([
      ['feature:F-001', 'screen:SCRN-001'],
      ['table:customer'],
    ]);
  });
});

describe('linkTasks: links that count for nothing', () => {
  const items = coverageItems(coverageDocuments());

  it('RF-627 a repeated link and a link to an id that is no item are ignored', () => {
    const draft = {
      links: [
        { task: 1, builds: ['feature:F-001', 'feature:F-001', 'feature:F-099', 'table:nothing'] },
        { task: 1, builds: ['feature:F-001', 'FEAT-001'] },
      ],
    };

    const [first] = linkTasks(twoTasks(), draft, items);

    expect(first?.builds).toEqual(['feature:F-001']);
  });

  it('RF-627 a link to a task that does not exist is ignored', () => {
    const draft = {
      links: [
        { task: 3, builds: ['feature:F-001'] },
        { task: 0, builds: [] },
      ],
    };

    const linked = linkTasks(twoTasks(), draft, items);

    expect(linked.map((task) => task.builds)).toEqual([[], []]);
  });

  it('RF-627 without a readable answer no task builds anything', () => {
    const linked = linkTasks(twoTasks(), undefined, items);

    expect(linked.map((task) => task.builds)).toEqual([[], []]);
  });

  it('RF-627 the other fields of a task are kept', () => {
    const linked = linkTasks(twoTasks(), { links: [] }, items);

    expect(linked).toEqual(twoTasks());
  });
});

describe('coverageOf', () => {
  const items = coverageItems(coverageDocuments());

  it('RF-627 a plan with no task leaves every item uncovered', () => {
    const report = coverageOf(items, []);

    expect(ids(report.uncovered)).toEqual(sortedIds(items));
  });

  it('RF-627 an item is covered when a task links its id', () => {
    const tasks = [
      planTask({ builds: ['feature:F-001', 'table:customer'] }),
      planTask({ id: 'T-002', builds: ['screen:SCRN-003'] }),
    ];

    const report = coverageOf(items, tasks);

    expect(ids(report.uncovered)).not.toContain('feature:F-001');
    expect(ids(report.uncovered)).not.toContain('table:customer');
    expect(ids(report.uncovered)).not.toContain('screen:SCRN-003');
    expect(report.uncovered).toHaveLength(items.length - 3);
  });
});

describe('coverageOf: coverage is by link', () => {
  const items = coverageItems(coverageDocuments());

  it('RF-627 an item named only in the title of a task is not covered', () => {
    const tasks = [
      planTask({ title: 'Build customer_order, F-001, listOrders, FLOW-001 and SCRN-001' }),
    ];

    const report = coverageOf(items, tasks);

    expect(ids(report.uncovered)).toEqual(sortedIds(items));
  });

  it('RF-627 a hostile title that carries an id still builds nothing', () => {
    const hostile = '`feature:F-001` <b>feature:F-002</b> [x](table:customer)';

    const report = coverageOf(items, [planTask({ title: hostile, invariant: hostile })]);

    expect(ids(report.uncovered)).toEqual(sortedIds(items));
  });

  it('RF-627 a link to an id that is no item counts for nothing', () => {
    const tasks = [planTask({ builds: ['feature:F-099', 'F-001', 'FEAT-001'] })];

    const report = coverageOf(items, tasks);

    expect(ids(report.uncovered)).toEqual(sortedIds(items));
  });

  it('RF-627 the uncovered items come in the same order whatever the order they were found in', () => {
    const shuffled = [...items].reverse();

    const forward = coverageOf(items, []).uncovered;
    const backward = coverageOf(shuffled, []).uncovered;

    expect(ids(backward)).toEqual(ids(forward));
    expect(ids(forward)).toEqual([...ids(forward)].sort(kindThenId));
  });
});

describe('withMigrationCard', () => {
  const tables = targetModel().tables;

  it('RF-623 the first card of the plan writes the migrations of every table', () => {
    const tasks = [
      planTask({ id: 'T-001', title: 'Orders', builds: ['table:customer_order'] }),
      planTask({ id: 'T-002', title: 'Mail', dependsOn: ['T-001'], builds: ['feature:F-002'] }),
    ];

    const content = withMigrationCard(planOf(tasks), tables);

    const [first] = content.tasks;
    expect(first?.id).toBe('T-001');
    expect(first?.phase).toBe(1);
    expect(first?.title).toMatch(/migrations/iu);
    expect(first?.builds).toEqual(['table:customer', 'table:customer_order']);
  });

  it('RF-623 the other cards keep their order and their dependencies move with their ids', () => {
    const tasks = [
      planTask({ id: 'T-001', title: 'Orders' }),
      planTask({ id: 'T-002', title: 'Mail', dependsOn: ['T-001'] }),
    ];

    const content = withMigrationCard(planOf(tasks), tables);

    expect(content.tasks.map((task) => [task.id, task.title])).toEqual([
      ['T-001', 'Write the database migrations in the chosen stack'],
      ['T-002', 'Orders'],
      ['T-003', 'Mail'],
    ]);
    expect(content.tasks[2]?.dependsOn).toEqual(['T-002']);
  });
});

describe('withMigrationCard: the card', () => {
  const tables = targetModel().tables;

  it('RF-623 a card that builds a table waits for the migrations', () => {
    const tasks = [
      planTask({ id: 'T-001', title: 'Orders', builds: ['table:customer_order'] }),
      planTask({ id: 'T-002', title: 'Mail', builds: ['feature:F-002'] }),
    ];

    const content = withMigrationCard(planOf(tasks), tables);

    expect(content.tasks[1]?.dependsOn).toEqual(['T-001']);
    expect(content.tasks[2]?.dependsOn).toEqual([]);
  });

  it('RF-623 the migration card is a card an agent can build: invariant, scenarios, risk and probes', () => {
    const content = withMigrationCard(planOf(twoTasks()), tables);

    const card = content.tasks[0];
    expect(card?.invariant).not.toBe('');
    expect(card?.riskClass).toBe('data loss');
    expect(card?.probes.length).toBeGreaterThan(0);
    const scenarios = card?.acceptanceCriteria ?? [];
    expect(scenarios.every((each) => /^Given .+, when .+, then .+/u.test(each))).toBe(true);
    expect(scenarios[0]).toContain('2 tables');
  });
});

describe('withMigrationCard: when there is none', () => {
  const tables = targetModel().tables;

  it('RF-623 a plan with no table gets no migration card', () => {
    const content = withMigrationCard(planOf(twoTasks()), []);

    expect(content.tasks.map((task) => task.id)).toEqual(['T-001', 'T-002']);
  });

  it('RF-627 a plan with no task gets no migration card, so nothing is covered by it', () => {
    expect(withMigrationCard(planOf([]), tables).tasks).toEqual([]);
  });

  it('RF-623 a plan with no phase gets no migration card', () => {
    const content = withMigrationCard(planOf(twoTasks(), 0), tables);

    expect(content.tasks.map((task) => task.id)).toEqual(['T-001', 'T-002']);
  });

  it('RF-623 the migration card builds on the requirements of the entities the tables come from', () => {
    const content = withMigrationCard(planOf(twoTasks()), tables);

    expect(content.tasks[0]?.requirements).toEqual(['REQ-001']);
  });
});
