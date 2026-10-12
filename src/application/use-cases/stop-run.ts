import type { Actor } from '../../domain/accounts/actor.js';
import type { Result } from '../../domain/errors/result.js';
import type { RunQueue, StopOutcome, StopProblem } from '../runs/run-queue.js';

// RF-1108, RNF-002, RF-1105: Stop run aborts the signal of the user's running run, which then ends
// as `Interrupted`, or cancels their queued run. Another user's run id and an unknown id give the
// same answer; a run that has ended cannot be stopped.

export interface StopRunDependencies {
  readonly queue: RunQueue;
}

export class StopRun {
  private readonly deps: StopRunDependencies;

  constructor(deps: StopRunDependencies) {
    this.deps = deps;
  }

  // RF-1108, RF-1105
  execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<StopOutcome, StopProblem>> {
    return this.deps.queue.stop(request.actor.userId, request.runId);
  }
}
