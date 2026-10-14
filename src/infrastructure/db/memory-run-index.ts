import type { EpochMs } from '../../domain/accounts/user.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { RunIndex, RunSource, SnapshotUsage } from '../../application/ports/run-index.js';
import { inQueueOrder } from '../../domain/runs/queue-rules.js';
import { endRun, startRun, type Run, type RunTotals } from '../../domain/runs/run.js';
import type { RunEndState } from '../../domain/runs/run-states.js';

// Architecture section 7, RF-1108, RF-1105: the run rows in memory, for unit tests. Passes the
// same contract suite as PgRunIndex: reads scoped by the owner, a run key unique per project, the
// end state set once, queue order by queue time then id.

function byId(left: Run, right: Run): number {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function newestFirst(left: Run, right: Run): number {
  return right.queuedAt - left.queuedAt || byId(left, right);
}

function oldestStartFirst(left: Run, right: Run): number {
  return (left.startedAt ?? 0) - (right.startedAt ?? 0) || byId(left, right);
}

/** The use of a snapshot with one more run counted. */
function withRun(key: string, before: SnapshotUsage | undefined, run: Run): SnapshotUsage {
  const { runs = 0, active = 0, lastUsedAt = 0 } = before ?? {};
  const used = run.endedAt ?? run.startedAt ?? run.queuedAt;
  return {
    snapshotKey: key,
    runs: runs + 1,
    active: active + (run.queueState === 'Ended' ? 0 : 1),
    lastUsedAt: Math.max(lastUsedAt, used),
  };
}

export class MemoryRunIndex implements RunIndex {
  private readonly runs = new Map<string, Run>();

  insert(run: Run): Promise<Result<Run, 'run-key-taken'>> {
    const taken = [...this.runs.values()].some(
      (stored) => stored.projectId === run.projectId && stored.runKey === run.runKey,
    );
    if (taken) return Promise.resolve(err('run-key-taken'));
    this.runs.set(run.id, run);
    return Promise.resolve(ok(run));
  }

  find(userId: string, runId: string): Promise<Run | undefined> {
    const run = this.runs.get(runId);
    return Promise.resolve(run?.userId === userId ? run : undefined);
  }

  list(userId: string, projectId: string): Promise<readonly Run[]> {
    const own = [...this.runs.values()].filter(
      (run) => run.userId === userId && run.projectId === projectId,
    );
    return Promise.resolve(own.sort(newestFirst));
  }

  // Stub until the bounded read is written.
  projectSummaries(): Promise<never> {
    return Promise.reject(new Error('Not implemented yet'));
  }

  listQueued(): Promise<readonly Run[]> {
    return Promise.resolve(this.inState('Queued').sort(inQueueOrder));
  }

  listRunning(): Promise<readonly Run[]> {
    return Promise.resolve(this.inState('Running').sort(oldestStartFirst));
  }

  start(runId: string, at: EpochMs): Promise<Run | undefined> {
    const run = this.runs.get(runId);
    return Promise.resolve(this.keep(run === undefined ? undefined : startRun(run, at)));
  }

  end(runId: string, endState: RunEndState, at: EpochMs): Promise<Run | undefined> {
    const run = this.runs.get(runId);
    return Promise.resolve(this.keep(run === undefined ? undefined : endRun(run, endState, at)));
  }

  recordSource(runId: string, source: RunSource): Promise<Run | undefined> {
    return Promise.resolve(this.update(runId, source));
  }

  recordTotals(runId: string, totals: RunTotals): Promise<Run | undefined> {
    return Promise.resolve(this.update(runId, { totals }));
  }

  removeEnded(userId: string, runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (run?.userId !== userId || run.queueState !== 'Ended') return Promise.resolve(false);
    this.runs.delete(runId);
    return Promise.resolve(true);
  }

  removeEndedOfProject(userId: string, projectId: string): Promise<void> {
    for (const run of [...this.runs.values()]) {
      const own = run.userId === userId && run.projectId === projectId;
      if (own && run.queueState === 'Ended') this.runs.delete(run.id);
    }
    return Promise.resolve();
  }

  snapshotUsage(): Promise<readonly SnapshotUsage[]> {
    const usage = new Map<string, SnapshotUsage>();
    for (const run of this.runs.values()) {
      if (run.snapshotKey !== null)
        usage.set(run.snapshotKey, withRun(run.snapshotKey, usage.get(run.snapshotKey), run));
    }
    const byKey = (left: SnapshotUsage, right: SnapshotUsage): number =>
      left.snapshotKey < right.snapshotKey ? -1 : 1;
    return Promise.resolve([...usage.values()].sort(byKey));
  }

  private inState(state: Run['queueState']): Run[] {
    return [...this.runs.values()].filter((run) => run.queueState === state);
  }

  /** Stores the result of a transition when it was allowed. */
  private keep(result: Result<Run, unknown> | undefined): Run | undefined {
    if (!result?.ok) return undefined;
    this.runs.set(result.value.id, result.value);
    return result.value;
  }

  private update(runId: string, changes: Partial<Run>): Run | undefined {
    const run = this.runs.get(runId);
    if (run === undefined || run.queueState === 'Ended') return undefined;
    const updated = { ...run, ...changes };
    this.runs.set(runId, updated);
    return updated;
  }
}
