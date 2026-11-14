import { z } from 'zod';

// RF-1410: what a reader turn that answers with tool calls gave the run's read gate, counted from
// its calls and the case alone, and the means of those counts over the turns of a run. Each count
// stands for what a run does with such a call (agent-loop.ts, ToolRunner, the read gate); the
// definitions are in RF-1410.

const count = z.number().int().min(0);
const share = z.number().min(0);

export const toolTurnSchema = z.strictObject({
  calls: count,
  /** `read_file` calls of a readable file of which more than half of the lines are new. */
  areaReads: count,
  /** Valid `grep` and `codemap_query` calls of a readable file or a symbol. */
  searches: count,
  /** Reads or code map queries of a path that names no readable file. */
  unlisted: count,
  /** Calls that repeat an earlier call of the conversation or of the same answer. */
  repeats: count,
  /** `list_area_files` calls: the list is already in the first message. */
  relists: count,
  /** `read_file` calls of a readable file of which half of the lines or fewer are new. */
  stale: count,
  /** Lines of readable files read for the first time. */
  newLines: count,
  /** The new lines that lie in generated or descriptor files. */
  generatedLines: count,
  /** The share of the area read before the turn (read-more: the refusal's); null otherwise. */
  shareBefore: share.nullable(),
  /** What the new lines add to the share of the area read. */
  shareGain: share,
  /** Area reads of a file the prompt points to (read-more, reread); null for the other prompts. */
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
  readonly searches: number;
  readonly stale: number;
  readonly unlisted: number;
  readonly repeats: number;
  readonly relists: number;
  readonly newLines: number;
  readonly shareGain: number;
  /** Generated or descriptor lines over all new lines of the run; null when none was new. */
  readonly generatedShare: number | null;
  /** Per turn that records an aim; null when none does. */
  readonly aimed: number | null;
  /** The turns that record a share before them (read-more). */
  readonly shareTurns: number;
  /** Of those, the turns whose share reaches 50%; null when none records a share. */
  readonly reachedHalf: number | null;
}

/** The counts per turn over the cases that record a turn; null when none does. */
// RF-1410
export function summariseTurns(turns: readonly (ToolTurn | undefined)[]): TurnSummary | null {
  const recorded = turns.filter((turn): turn is ToolTurn => turn !== undefined);
  if (recorded.length === 0) return null;
  const sum = (list: readonly ToolTurn[], pick: (turn: ToolTurn) => number): number =>
    list.reduce((total, turn) => total + pick(turn), 0);
  const per = (pick: (turn: ToolTurn) => number): number => sum(recorded, pick) / recorded.length;
  const aimed = recorded.filter((turn) => turn.aimed !== null);
  const shared = recorded.filter((turn) => turn.shareBefore !== null);
  const newLines = sum(recorded, (turn) => turn.newLines);
  const reached = shared.filter((turn) => (turn.shareBefore ?? 0) + turn.shareGain >= HALF);
  return {
    ...{ turns: recorded.length, calls: per((turn) => turn.calls) },
    ...{ areaReads: per((turn) => turn.areaReads), searches: per((turn) => turn.searches) },
    ...{ stale: per((turn) => turn.stale), unlisted: per((turn) => turn.unlisted) },
    ...{ repeats: per((turn) => turn.repeats), relists: per((turn) => turn.relists) },
    ...{ newLines: per((turn) => turn.newLines), shareGain: per((turn) => turn.shareGain) },
    generatedShare: newLines === 0 ? null : sum(recorded, (turn) => turn.generatedLines) / newLines,
    aimed: aimed.length === 0 ? null : sum(aimed, (turn) => turn.aimed ?? 0) / aimed.length,
    shareTurns: shared.length,
    reachedHalf: shared.length === 0 ? null : reached.length,
  };
}

/** Q-50: the share of the area at which a run accepts an answer as read enough. */
const HALF = 0.5;
