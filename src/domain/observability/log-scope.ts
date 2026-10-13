// RF-1011, RF-1105: which application log entries belong to a run.

export interface LogScopeEntry {
  readonly runId?: string | undefined;
  readonly userId?: string | undefined;
}

export interface LogScopeRun {
  /** The run's UUID. */
  readonly id: string;
  /** The folder name; unique per project only. */
  readonly runKey: string;
  readonly userId: string;
}

/**
 * An entry is the run's when it names the run's UUID and no other user, or the run's key and the
 * owner. The key is unique per project only and a deleted run's entries stay in the log, so an entry
 * with the key and no user may be another user's run that is gone: it is never the run's.
 */
// RF-1011, RF-1105
export function entryBelongsToRun(entry: LogScopeEntry, run: LogScopeRun): boolean {
  if (entry.runId === run.id) return entry.userId === undefined || entry.userId === run.userId;
  return entry.runId === run.runKey && entry.userId === run.userId;
}
