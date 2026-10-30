import { isLocalTier, localModelCeiling, type BuildMethod } from './build-method.js';
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

export interface DifficultyBand {
  readonly from: number;
  readonly to: number;
  readonly tier: (typeof difficultyBands)[number]['tier'];
}

/**
 * RF-635, RF-641, P7-12: the bands of a build. A tier whose model runs locally stops at the local
 * ceiling (difficulty 2) and the next tier starts right after it; a local tier whose band would be
 * empty takes no card. The last tier never stops: nothing is above it. Without a local tier these
 * are `difficultyBands`.
 */
// RF-641
export function bandsFor(method?: BuildMethod): readonly DifficultyBand[] {
  const bands: DifficultyBand[] = [];
  let start = 1;
  difficultyBands.forEach((natural, index) => {
    const local =
      method !== undefined &&
      index < difficultyBands.length - 1 &&
      isLocalTier(method, natural.tier);
    const to = local ? Math.min(natural.to, localModelCeiling) : natural.to;
    if (to < start) return;
    bands.push({ from: start, to, tier: natural.tier });
    start = to + 1;
  });
  return bands;
}

const difficultyOfSize: Readonly<Record<TaskSize, number>> = { S: 4, M: 6, L: 8 };

export interface TaskDifficulty {
  readonly rating: number;
  readonly tier: (typeof difficultyBands)[number]['tier'];
  /** The tier that verifies the card: the largest for a risk class or difficulty 9-10, else the middle one (RF-635, RF-639). */
  readonly verifier: (typeof difficultyBands)[number]['tier'];
}

/** RF-635, DEC-176 Q-C: the rating an M or L card at a risk class gets, the lowest of the largest band. */
const riskRating = 9;

/** The model tier of a rating from 1 to 10 (the bands of RF-635, moved by a local tier, RF-641). */
export function tierOfRating(rating: number, method?: BuildMethod): TaskDifficulty['tier'] {
  return (
    bandsFor(method).find((each) => rating >= each.from && rating <= each.to)?.tier ?? 'middle'
  );
}

/**
 * RF-612, RF-635: the builder difficulty of a card, from 1 to 10, and the model tier that builds
 * it. A card rates by its size; a risk class other than `none` rates a medium or large card 9 (the
 * largest tier) and raises a small card to the middle tier without changing its rating.
 */
// RF-612, RF-635, RF-639
export function difficultyOfTask(task: PlanTask, method?: BuildMethod): TaskDifficulty {
  const { size } = sizeOfTask(task);
  const atRisk = task.riskClass !== 'none';
  const rating = atRisk && size !== 'S' ? riskRating : difficultyOfSize[size];
  const verifier = atRisk || rating >= riskRating ? 'largest' : 'middle';
  return {
    rating,
    tier: tierForRisk(tierOfRating(rating, method), task.riskClass, method),
    verifier,
  };
}

type ModelTier = TaskDifficulty['tier'];

/**
 * RF-635, RF-641: a risk class other than `none` raises the smallest tier to the middle one, never
 * lowers. When the middle tier has no band (it runs locally), the card goes to the next tier that has.
 */
// RF-635
export function tierForRisk(
  tier: ModelTier,
  riskClass: PlanTask['riskClass'],
  method?: BuildMethod,
): ModelTier {
  if (tier !== 'smallest' || riskClass === 'none') return tier;
  const bands = bandsFor(method);
  return (
    (['middle', 'largest'] as const).find((each) => bands.some((b) => b.tier === each)) ?? 'largest'
  );
}
