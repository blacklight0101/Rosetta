import type { Area } from '../../domain/code-map/area.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-200, DEC-15: the reader tasks of an understand run: one per area of the code map, or one per
// area the start request named, always in the code map's area order (so card ids follow it,
// RF-203). A name the code map does not have stops the run, and the refusal lists the valid names.
// Names are compared exactly, as the code map writes them.

export interface ReaderTask {
  /** `reader-001`: a plain file name, used for the transcript and the invalid output (3.7, 3.15). */
  readonly agentTaskId: string;
  readonly area: Area;
  /** RF-241: the owner's answers to the questions of this area, in a re-run with answers. */
  readonly answers?: string;
  /** RF-209: a Deepen re-read: the rejected claims with the verifier's reasons, as JSON. */
  readonly rejected?: string;
  /** RF-209: the ids of those claims, the only ones a new claim may name as replaced. */
  readonly replaceable?: readonly string[];
  /** RF-209: the parent's cards for the area (id, type, title), as JSON for a data block. */
  readonly parentCards?: string;
  /** RF-209: the ids of those cards, the only ones a card of the task may extend. */
  readonly extendable?: readonly string[];
}

export interface UnknownAreas {
  readonly unknown: readonly string[];
  /** Every area of the code map, in its order. */
  readonly valid: readonly string[];
}

function taskId(index: number): string {
  return `reader-${String(index + 1).padStart(3, '0')}`;
}

// RF-200
export function planReaderTasks(
  areas: readonly Area[],
  requested: readonly string[] | undefined,
): Result<readonly ReaderTask[], UnknownAreas> {
  const valid = areas.map((area) => area.name);
  const named = new Set(requested ?? []);
  const unknown = [...named].filter((name) => !valid.includes(name));
  if (unknown.length > 0) return err({ unknown, valid });
  const chosen = named.size === 0 ? areas : areas.filter((area) => named.has(area.name));
  return ok(chosen.map((area, index) => ({ agentTaskId: taskId(index), area })));
}
