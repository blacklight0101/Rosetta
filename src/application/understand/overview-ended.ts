import type { RunExecution } from '../ports/run-executor.js';
import { readUnderstandOptions, type OverviewEnded } from './understand-options.js';

// P7-26: how the run ended before "Write the overview" queued it again. A manifest without the
// record (queued by an older build) is unknown: the outcome then follows only what is left to do,
// and no end state or count is invented (P8-12).

export function endedBefore(parts: {
  readonly execution: Pick<RunExecution, 'manifest'>;
}): OverviewEnded | undefined {
  return readUnderstandOptions(parts.execution.manifest.options).overviewEnded;
}
