import type { CoverageDocuments } from '../../src/domain/planning/plan-coverage.js';
import type { PlanContent } from '../../src/domain/planning/plan-content.js';
import { emptyPrd } from '../../src/domain/planning/prd-content.js';
import { noUx } from '../../src/domain/planning/target-ux.js';
import { apiOperations } from './api-contract-fixtures.js';
import { targetModel } from './data-model-fixtures.js';
import { planTask } from './task-card-fixtures.js';
import { uxOf } from './ux-fixtures.js';

// RF-627: the documents of a package with one item of every kind a task card can build, and a
// plan content over them, for the coverage tests. Items: features F-001 and F-002; tables
// `customer` and `customer_order`; the six operations of the API fixture; the flow FLOW-001; the
// screens SCRN-001 and SCRN-003.

const flow = { cardId: 'FLOW-001', title: 'Checkout', trigger: 't', outcome: 'o', steps: [] };

/** A package with all five kinds of item. */
export function coverageDocuments(text = 'Text'): CoverageDocuments {
  return {
    prd: {
      ...emptyPrd,
      features: [
        { title: 'Place an order', description: 'd', priority: 'Must', sources: ['FEAT-001'] },
        { title: 'List customers', description: 'd', priority: 'Should', sources: ['FEAT-002'] },
      ],
    },
    dataModel: targetModel(),
    flows: {
      flows: [flow],
      outOfScope: [{ cardId: 'FLOW-002', title: text, reason: text, byPlanner: true }],
    },
    apiContract: { kind: 'openapi', operations: apiOperations(), unserved: [] },
    ux: uxOf(text),
  };
}

/** A package with nothing in it but one feature. */
export function featureOnlyDocuments(): CoverageDocuments {
  const full = coverageDocuments();
  return {
    prd: full.prd,
    dataModel: { database: null, tables: [], dropped: [] },
    flows: { flows: [], outOfScope: [] },
    apiContract: { kind: 'none', reason: 'No contract.' },
    ux: noUx,
  };
}

/** The content of a plan with one phase and the given tasks. */
export function planOf(tasks: PlanContent['tasks'], phases = 1): PlanContent {
  return {
    summary: 'A plan.',
    requirements: [
      { id: 'REQ-001', title: 'Orders', statement: 'Place an order.', sources: ['ENT-001'] },
      { id: 'REQ-002', title: 'Mail', statement: 'Send mail.', sources: ['FEAT-009'] },
    ],
    components: [],
    decisions: [],
    entities: [],
    phases: Array.from({ length: phases }, (_, index) => ({
      ...{ number: index + 1, name: `Phase ${String(index + 1)}`, goal: 'A goal.' },
      exitCriteria: ['Done.'],
    })),
    tasks,
    risks: [],
    technical: { integrations: [], security: [], targets: [], environments: [] },
  };
}

/** Two planned tasks: T-001 in phase 1 and T-002 in phase 1 waiting for T-001. */
export function twoTasks(): PlanContent['tasks'] {
  return [
    planTask({ id: 'T-001', title: 'Orders' }),
    planTask({ id: 'T-002', title: 'Mail', dependsOn: ['T-001'] }),
  ];
}
