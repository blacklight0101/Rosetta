import type { CodeMap } from '../../domain/code-map/code-map.js';
import { thirdPartyAreaNames } from '../../domain/code-map/third-party.js';
import type { RunCoverage } from './run-coverage.js';
import type { ReaderTask } from './reader-tasks.js';

// P7-02, DEC-194, RF-230: the planned areas no reader started (the room check ended the readers, or
// a cap or a Stop came first) are listed in the coverage as not read, so their tokens are in the
// denominator and a Deepen can read them.

/**
 * Records each planned task that never ended as not read and returns how many of them are areas of
 * own code (a skipped library area is listed, but does not make the run partly read).
 */
export function recordUnread(
  parts: {
    readonly tasks: readonly ReaderTask[];
    readonly scanned: { readonly codeMap: CodeMap };
  },
  coverage: RunCoverage,
  ends: ReadonlyMap<string, unknown>,
): number {
  const { tasks, scanned } = parts;
  const skipped = tasks.filter((task) => !ends.has(task.agentTaskId));
  for (const task of skipped) coverage.recordNotRead(task, scanned.codeMap);
  const library = thirdPartyAreaNames(scanned.codeMap);
  return skipped.filter((task) => !library.has(task.area.name)).length;
}
