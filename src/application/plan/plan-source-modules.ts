import type { SourceCard } from '../../domain/planning/plan-sources.js';
import { sourceModules, type SourceModules } from '../../domain/planning/source-modules.js';
import type { PlanInputs } from './plan-inputs.js';
import { scanOfSourceRun, type PlanShapeDependencies } from './plan-shapes.js';

// P8-06, RF-601, EV-32: the modules and deployment material of the scan the source run read, with
// the supported cards that cite them, so the task cards are checked against them. Nothing is read
// but the code map and no model is called. Without a scan of that snapshot, or when it cannot be
// read, there are no modules to check (the masked-secret risks already log an unreadable scan).

// P8-06, RF-601
export async function planSourceModules(
  deps: Pick<PlanShapeDependencies, 'runs' | 'scans'>,
  inputs: Pick<PlanInputs, 'project' | 'sourceRun'>,
  cards: readonly SourceCard[],
): Promise<SourceModules | undefined> {
  const scan = await scanOfSourceRun(deps, inputs);
  if (scan === undefined) return undefined;
  try {
    const { codeMap } = await deps.scans.open(scan);
    return sourceModules(codeMap.files, cards);
  } catch {
    return undefined;
  }
}
