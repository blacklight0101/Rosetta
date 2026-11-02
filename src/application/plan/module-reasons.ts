import type { ModuleReason } from '../../domain/planning/module-coverage.js';
import type { CoverageItem } from '../../domain/planning/plan-coverage.js';
import type { SourceModules } from '../../domain/planning/source-modules.js';
import type { GapProblem } from './gap-answer.js';

// P8-06, RF-601: why a module has no task card (skeleton; the reasons come with the feature).

export interface ModuleRounds {
  readonly asked: boolean;
  readonly refused: boolean;
  readonly problems: readonly GapProblem[];
}

// P8-06, RF-601
export function moduleReasons(
  untouched: readonly CoverageItem[],
  rounds: ModuleRounds,
  modules: SourceModules | undefined,
): ModuleReason[] {
  return untouched.length < 0 || rounds.asked || modules !== undefined ? [] : [];
}
