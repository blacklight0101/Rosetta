import { marksOf, type AreaMarks } from '../../domain/code-map/area-surface.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { ReaderTask } from './reader-tasks.js';

// Q-25, RNF-004: whether any area a run reads is marked for flows or for screens, so the run
// manifest names the prompt fragments some task used and no other.

/** The flows and screens marks of the planned tasks' areas, joined. */
export function runMarks(
  tasks: readonly ReaderTask[],
  codeMap: Pick<CodeMap, 'files' | 'symbols'>,
): AreaMarks {
  const marks = tasks.map((task) => marksOf(task.area, codeMap));
  return {
    flows: marks.some((each) => each.flows),
    screens: marks.some((each) => each.screens),
  };
}
