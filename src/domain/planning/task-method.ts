import type { PlanPhase, PlanTask } from './plan-content.js';

// RF-611, RF-612, DEC-75, DEC-79: what the package derives from a task card without asking the
// model: its size from the scope it states (the requirements it builds and its acceptance
// criteria), the effort of a phase and its share per person, and the difficulty rating for
// builders. The same card always gets the same size and rating.

/** The catalogue entries whose rules change how a task card is written (RF-607). */
export const methodPrinciples = { tdd: 'tdd', sdd: 'sdd' } as const;

/** The catalogue group whose entries become a review checklist on each card (RF-607). */
export const reviewGroup = 'design-principles';

type TaskSize = 'S' | 'M' | 'L';

export interface SizeOfTask {
  readonly size: TaskSize;
  readonly points: number;
}

const sizes: Readonly<Record<TaskSize, number>> = { S: 1, M: 2, L: 3 };

/** Up to 2 items of scope is small, up to 4 medium, more is large. */
// RF-611
export function sizeOfTask(task: PlanTask): SizeOfTask {
  const scope = task.requirements.length + task.acceptanceCriteria.length;
  const size = scope <= 2 ? 'S' : scope <= 4 ? 'M' : 'L';
  return { size, points: sizes[size] };
}

export interface PhaseSize {
  readonly points: number;
  readonly cards: number;
  /** Points a person carries, rounded up; undefined when the team size is not stated. */
  readonly perPerson: number | undefined;
}

// RF-611
export function sizeOfPhase(
  phase: PlanPhase,
  tasks: readonly PlanTask[],
  teamSize: number | null,
): PhaseSize {
  const own = tasks.filter((task) => task.phase === phase.number);
  const points = own.reduce((sum, task) => sum + sizeOfTask(task).points, 0);
  const perPerson = teamSize === null || teamSize < 1 ? undefined : Math.ceil(points / teamSize);
  return { points, cards: own.length, perPerson };
}

/** The model tiers of the difficulty bands (the bands RF-635 uses for the build method). */
export const difficultyBands = [
  { from: 1, to: 5, tier: 'smallest' },
  { from: 6, to: 8, tier: 'middle' },
  { from: 9, to: 10, tier: 'largest' },
] as const;

const difficultyOfSize: Readonly<Record<TaskSize, number>> = { S: 4, M: 6, L: 8 };

export interface TaskDifficulty {
  readonly rating: number;
  readonly tier: (typeof difficultyBands)[number]['tier'];
}

/**
 * RF-612, RF-635: the builder difficulty of a card, from 1 to 10, and the model tier that builds
 * it: the tier of its band, and at least the middle one when its risk class is not `none`.
 */
// RF-612, RF-635
export function difficultyOfTask(task: PlanTask): TaskDifficulty {
  const rating = difficultyOfSize[sizeOfTask(task).size];
  const tier = difficultyBands.find((each) => rating >= each.from && rating <= each.to)?.tier;
  return { rating, tier: tierForRisk(tier ?? 'middle', task.riskClass) };
}

type ModelTier = TaskDifficulty['tier'];

/** RF-635: a risk class other than `none` raises the smallest tier to the middle one, never lowers. */
// RF-635
export function tierForRisk(tier: ModelTier, riskClass: PlanTask['riskClass']): ModelTier {
  return tier === 'smallest' && riskClass !== 'none' ? 'middle' : tier;
}
