import type { PlanTask } from './plan-content.js';
import { isMigrationCard } from './plan-coverage.js';

// RF-631, P10-14, P10-D6: a FEAT card that a requirement cites and no feature of the PRD traces to
// is built by no feature, so the narrowing to the built features (P5-41) would take it off every task
// that builds one. It is kept by one task card, never repeated on each card that lists the
// requirement: the task (not the migrations card) that lists the most requirements citing it, then
// the one that builds the fewest items, then the first in plan order. When a task that lists such a
// requirement builds no feature, that task keeps the card already and no owner is named.

/** Item id (`feature:F-001`) to the card ids it traces to. */
type Scope = ReadonlyMap<string, readonly string[]>;

interface Requirement {
  readonly id: string;
  readonly sources: readonly string[];
}

const FEATURE = 'feature:';

/** Whether some item of the package of that kind (`feature:`) traces to the card. */
export function traced(scope: Scope, prefix: string, cardId: string): boolean {
  return [...scope].some(([id, cards]) => id.startsWith(prefix) && cards.includes(cardId));
}

interface Candidate {
  readonly task: PlanTask;
  readonly order: number;
  readonly citing: number;
}

function better(a: Candidate, b: Candidate): Candidate {
  if (a.citing !== b.citing) return a.citing > b.citing ? a : b;
  if (a.task.builds.length !== b.task.builds.length) {
    return a.task.builds.length < b.task.builds.length ? a : b;
  }
  return a.order <= b.order ? a : b;
}

function ownerOf(
  cardId: string,
  tasks: readonly PlanTask[],
  requirements: readonly Requirement[],
): string | undefined {
  const citing = new Set(
    requirements.filter((each) => each.sources.includes(cardId)).map((each) => each.id),
  );
  const candidates = tasks.flatMap((task, order): Candidate[] => {
    const count = task.requirements.filter((id) => citing.has(id)).length;
    return count === 0 || isMigrationCard(task) ? [] : [{ task, order, citing: count }];
  });
  const plain = candidates.some((each) => !each.task.builds.some((id) => id.startsWith(FEATURE)));
  if (plain) return undefined;
  return candidates.reduce<Candidate | undefined>(
    (best, each) => (best === undefined ? each : better(best, each)),
    undefined,
  )?.task.id;
}

/** The task that keeps each FEAT card no feature traces to, by card id. */
// RF-631
export function untracedFeatureOwners(
  tasks: readonly PlanTask[],
  requirements: readonly Requirement[],
  scope: Scope,
): Map<string, string> {
  const cards = new Set(
    requirements.flatMap((each) => each.sources).filter((id) => id.startsWith('FEAT-')),
  );
  const owners = new Map<string, string>();
  for (const cardId of cards) {
    if (traced(scope, FEATURE, cardId)) continue;
    const owner = ownerOf(cardId, tasks, requirements);
    if (owner !== undefined) owners.set(cardId, owner);
  }
  return owners;
}
