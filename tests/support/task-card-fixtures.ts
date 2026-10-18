import type { PlanTask } from '../../src/domain/planning/plan-content.js';
import type { DraftTask } from '../../src/domain/planning/plan-draft.js';

// RF-630, RF-635: a draft task and a planned task that are valid cards, for tests to change one
// field of.

/** A Done-when item with concrete inputs. */
export const scenario =
  'Given a basket of 60, when the customer confirms, then the order is stored with free shipping.';

export const invariant = 'An order never ships free below the threshold of 50.';

/** A draft task of phase 1 that implements the first requirement, with nothing at risk. */
export function draftTask(overrides: Partial<DraftTask> = {}): DraftTask {
  return {
    ...{ title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [scenario] },
    ...{ invariant, riskClass: 'none', adds: [], probes: [] },
    ...{ files: [], needs: [], dependsOn: [] },
    ...overrides,
  };
}

/** A planned task with nothing at risk. */
export function planTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    ...{ id: 'T-001', title: 'A task', phase: 1, requirements: ['REQ-001'] },
    ...{ acceptanceCriteria: [scenario], invariant, riskClass: 'none', adds: [], probes: [] },
    ...{ files: [], identifiers: [], dependsOn: [], builds: [] },
    ...overrides,
  };
}
