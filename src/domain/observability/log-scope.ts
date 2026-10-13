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
 * An entry is the run's when it names the run (its UUID, or its key) and, if it names a user, that
 * user is the owner. An entry that names the key and no user is the run's only while no other user
 * has a run with that key (`keyShared`), because the key is unique per project only.
 */
// RF-1011, RF-1105
export function entryBelongsToRun(
  entry: LogScopeEntry,
  run: LogScopeRun,
  keyShared: boolean,
): boolean {
  if (entry.runId !== run.id && entry.runId !== run.runKey) return false;
  if (entry.userId !== undefined) return entry.userId === run.userId;
  return entry.runId === run.id || !keyShared;
}
