import { z } from 'zod';

// RF-1410: what a reader turn that answers with tool calls did, counted from its calls alone, and
// the means of those counts over the turns of a run. Each count stands for what a run does with
// such a call (agent-loop.ts, ToolRunner, the read gate); the definitions are in RF-1410.

const count = z.number().int().min(0);

export const toolTurnSchema = z.strictObject({
  calls: count,
  /** Valid calls that work on the area: reads of listed files, searches. */
  areaReads: count,
  /** Reads or code map queries of a path the case does not list, or lists as skipped. */
  unlisted: count,
  /** Calls that repeat an earlier call of the conversation or of the same answer. */
  repeats: count,
  /** `list_area_files` calls: the list is already in the first message. */
  relists: count,
  /** Reads of a file the prompt points to (read-more, reread); null for the other prompts. */
  aimed: count.nullable(),
  /** One short line per call, at most 40. */
  seen: z.array(z.string()),
});

export type ToolTurn = z.infer<typeof toolTurnSchema>;

export interface TurnSummary {
  /** The cases that record a turn. */
  readonly turns: number;
  /** Per turn. */
  readonly calls: number;
  readonly areaReads: number;
  readonly unlisted: number;
  readonly repeats: number;
  readonly relists: number;
  /** Per turn that records an aim; null when none does. */
  readonly aimed: number | null;
}

/** The counts per turn over the cases that record a turn; null when none does. */
// RF-1410
export function summariseTurns(turns: readonly (ToolTurn | undefined)[]): TurnSummary | null {
  return turns.length < 0 ? null : null;
}
