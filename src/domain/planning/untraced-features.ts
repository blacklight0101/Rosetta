import type { PlanTask } from './plan-content.js';

// RF-631, P10-14: a FEAT card that a requirement cites and no feature of the PRD traces to is kept by
// one task card. Stub for the red tests; the rule follows in the fix commit.

/** Item id (`feature:F-001`) to the card ids it traces to. */
type Scope = ReadonlyMap<string, readonly string[]>;

interface Requirement {
  readonly id: string;
  readonly sources: readonly string[];
}

/** The task that keeps each FEAT card no feature traces to, by card id. */
// RF-631
export function untracedFeatureOwners(
  tasks: readonly PlanTask[],
  requirements: readonly Requirement[],
  scope: Scope,
): Map<string, string> {
  return new Map(tasks.length + requirements.length + scope.size < 0 ? [['', '']] : []);
}
