import type { RunExecution } from '../ports/run-executor.js';
import { readUnderstandOptions, type OverviewEnded } from './understand-options.js';

// P7-26: how the run ended before "Write the overview" queued it again. A manifest without the
// record (queued by an older build) is taken as capped with nothing counted.

const UNKNOWN: OverviewEnded = { endState: 'CapReached', failedAreas: 0, unreadAreas: 0 };

export function endedBefore(parts: {
  readonly execution: Pick<RunExecution, 'manifest'>;
}): OverviewEnded {
  return readUnderstandOptions(parts.execution.manifest.options).overviewEnded ?? UNKNOWN;
}
