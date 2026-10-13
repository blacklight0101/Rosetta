import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { summarizeCalls, type ProviderRoleSummary } from '../../domain/observability/call-stats.js';
import type { RunQueueState } from '../../domain/runs/run-states.js';
import type { RunCallReader, StoredCall } from '../ports/run-call-reader.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-1011, RF-408, RF-1105: List run calls gives the "API calls" panel the attempts of the provider
// call log of one run, each with its agent's area, and the summary per provider and role. Another
// user's run id and an unknown id give the same answer.

export interface ListRunCallsDependencies {
  readonly runs: RunIndex;
  readonly calls: RunCallReader;
  readonly manifests: RunManifestStore;
}

/** The most attempts one answer lists, newest last; the summary always counts them all. */
export const MAX_LISTED_CALLS = 2000;

export interface RunCall extends StoredCall {
  /** The area of the agent task when the manifest knows it, else the agent task id. */
  readonly agent: string;
}

export interface RunCallsView {
  /** The run's folder name. */
  readonly runKey: string;
  readonly runState: RunQueueState;
  /** Every attempt the call log holds. */
  readonly total: number;
  readonly calls: readonly RunCall[];
  readonly summary: readonly ProviderRoleSummary[];
}

export class ListRunCalls {
  private readonly deps: ListRunCallsDependencies;

  constructor(deps: ListRunCallsDependencies) {
    this.deps = deps;
  }

  // RF-1011, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<RunCallsView, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const scope = scopeOf(run);
    const [stored, manifest] = await Promise.all([
      this.deps.calls.calls(scope),
      this.deps.manifests.read(scope),
    ]);
    const areas = new Map(manifest?.agentTasks.map((task) => [task.agentTaskId, task.area]));
    return ok({
      runKey: run.runKey,
      runState: run.queueState,
      total: stored.length,
      calls: stored
        .slice(-MAX_LISTED_CALLS)
        .map((call) => ({ ...call, agent: areas.get(call.agentTaskId) ?? call.agentTaskId })),
      summary: summarizeCalls(stored),
    });
  }
}
