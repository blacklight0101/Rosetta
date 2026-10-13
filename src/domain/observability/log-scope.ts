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

// RF-1011, RF-1105
export function entryBelongsToRun(
  entry: LogScopeEntry,
  run: LogScopeRun,
  keyShared: boolean,
): boolean {
  void entry;
  void run;
  void keyShared;
  return false;
}
