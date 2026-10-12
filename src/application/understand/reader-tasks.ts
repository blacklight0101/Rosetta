import type { Area } from '../../domain/code-map/area.js';
import { ok, type Result } from '../../domain/errors/result.js';

// RF-200, DEC-15: the reader tasks of an understand run: one per area of the code map, or one per
// area the start request named, always in the code map's area order (so card ids follow it,
// RF-203). A name the code map does not have stops the run, and the refusal lists the valid names.

export interface ReaderTask {
  /** `reader-001`: a plain file name, used for the transcript and the invalid output (3.7, 3.15). */
  readonly agentTaskId: string;
  readonly area: Area;
}

export interface UnknownAreas {
  readonly unknown: readonly string[];
  /** Every area of the code map, in its order. */
  readonly valid: readonly string[];
}

// RF-200
export function planReaderTasks(
  _areas: readonly Area[],
  _requested: readonly string[] | undefined,
): Result<readonly ReaderTask[], UnknownAreas> {
  return ok([]);
}
