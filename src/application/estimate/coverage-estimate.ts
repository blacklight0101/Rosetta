import type { GapMessageInput } from '../plan/gap-message.js';
import type { PlanContent, PlanTask } from '../../domain/planning/plan-content.js';
import type { CoverageItem } from '../../domain/planning/plan-coverage.js';

// RF-613, RF-627, ADR-007: the task cards and the items the coverage call will send do not exist
// before the run. The estimate sizes the call for a typical package: 20 task cards with a 100
// character title and three 200 character criteria, and 60 items with a 60 character name and a
// 150 character detail. It is an assumption, not a bound; the budget guard still enforces the caps.
const TASKS = 20;
const ITEMS = 60;

// RF-613, RF-627
export function assumedCoverageInput(): {
  readonly tasks: readonly PlanTask[];
  readonly items: readonly CoverageItem[];
} {
  const tasks = Array.from({ length: TASKS }, (_, index) => ({
    ...{ id: `T-${String(index)}`, title: 'a'.repeat(100), phase: 1, requirements: [] },
    acceptanceCriteria: ['a'.repeat(200), 'a'.repeat(200), 'a'.repeat(200)],
    ...{ invariant: '', riskClass: 'none' as const, adds: [], probes: [], files: [] },
    ...{ identifiers: [], dependsOn: [], builds: [] },
  }));
  const items = Array.from({ length: ITEMS }, (_, index) => ({
    ...{ id: `feature:F-${String(index)}`, kind: 'feature' as const },
    name: 'a'.repeat(60),
    detail: 'a'.repeat(150),
  }));
  return { tasks, items };
}

const PHASES = 5;
const REQUIREMENTS = 30;

/**
 * RF-613, Q-45: the call for the items no task card builds, sized for the worst case of the typical
 * package: every one of its 60 items is left without a card, and the plan it joins has 5 phases
 * (a 60 character name, a 200 character goal), 30 requirements (a 100 character title) and the
 * 20 task cards of the coverage call. Whether items are left over is not known before the run.
 */
export function assumedGapInput(): GapMessageInput {
  const { tasks, items } = assumedCoverageInput();
  const content: PlanContent = {
    ...{ summary: '', components: [], decisions: [], entities: [], risks: [] },
    requirements: Array.from({ length: REQUIREMENTS }, (_, index) => ({
      ...{ id: `REQ-${String(index)}`, title: 'a'.repeat(100), statement: '', sources: [] },
    })),
    phases: Array.from({ length: PHASES }, (_, index) => ({
      ...{ number: index + 1, name: 'a'.repeat(60), goal: 'a'.repeat(200) },
      exitCriteria: [],
    })),
    tasks,
    technical: { integrations: [], security: [], targets: [], environments: [] },
  };
  return { items, content };
}
