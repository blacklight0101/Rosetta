import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { PlanTask } from '../../../../src/domain/planning/plan-content.js';
import { emptyPrd, type PrdContent } from '../../../../src/domain/planning/prd-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-627, P8-97, EV-95: the summary line of the plan coverage in checks.md (and on the plan page,
// which shows the sections of checks.md) names what it covers, and says how many requirements are
// built by no card when there are any, so it never reads "every item is built" above a list of
// requirements no card builds.

const masker = new SecretMasker();

const prd: PrdContent = {
  ...emptyPrd,
  features: [
    { title: 'Order', description: 'Place an order.', priority: 'Must', sources: ['FEAT-001'] },
  ],
};

const everything = ['feature:F-001', 'table:customer', 'table:customer_order', 'flow:FLOW-001'];

/** The package with the given tasks and `count` requirements, REQ-001 onwards. */
function packageOf(tasks: readonly PlanTask[], count = 1): HandoffPackage {
  const base = handoffOf('Plain text.', prd);
  const first = base.content.requirements[0];
  if (first === undefined) throw new Error('The fixture has a requirement');
  const requirements = Array.from({ length: count }, (_, at) => ({
    ...first,
    id: `REQ-${String(at + 1).padStart(3, '0')}`,
  }));
  return { ...base, content: { ...base.content, tasks, requirements } };
}

function summaryOf(handoff: HandoffPackage): string {
  const checks = (renderHandoff(handoff, masker)['checks.md'] ?? '').replaceAll('\\', '');
  const coverage = checks.split('## Plan coverage')[1] ?? '';
  const lines = coverage.split('\n').filter((line) => line.trim() !== '');
  return lines[1] ?? '';
}

describe('checks.md: the summary line of the plan coverage', () => {
  it('RF-627 names the features, tables, operations, journeys and screens every card builds', () => {
    const tasks = [planTask({ builds: everything, requirements: ['REQ-001'] })];

    expect(summaryOf(packageOf(tasks))).toBe(
      'Every feature, table, operation, journey and screen is built by at least one task card.',
    );
  });

  it('RF-627 says how many requirements are built by no card when every item is built', () => {
    const tasks = [planTask({ builds: everything, requirements: ['REQ-002'] })];

    expect(summaryOf(packageOf(tasks, 4))).toBe(
      'Every feature, table, operation, journey and screen is built by at least one task card; 3 requirements are built by no card.',
    );
  });

  it('RF-627 says one requirement in the singular', () => {
    const tasks = [planTask({ builds: everything, requirements: [] })];

    expect(summaryOf(packageOf(tasks))).toBe(
      'Every feature, table, operation, journey and screen is built by at least one task card; 1 requirement is built by no card.',
    );
  });

  it('RF-627 says how many requirements are built by no card next to the items no card builds', () => {
    const tasks = [planTask({ builds: ['feature:F-001'], requirements: [] })];

    expect(summaryOf(packageOf(tasks, 2))).toBe(
      '3 items of 4 are built by no task card, and 2 requirements are built by no card; the run is not complete.',
    );
  });
});
