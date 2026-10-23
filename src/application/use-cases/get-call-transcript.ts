import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { RunCallReader, StoredTranscriptEntry } from '../ports/run-call-reader.js';
import type { RunIndex } from '../ports/run-index.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-1011, RF-408, RF-1105: Get call transcript gives the masked messages one call of the user's own
// run added to its agent task's transcript. Another user's run id, an unknown id and a call the
// log does not hold give the same answer.

export interface GetCallTranscriptDependencies {
  readonly runs: RunIndex;
  readonly calls: RunCallReader;
}

export class GetCallTranscript {
  private readonly deps: GetCallTranscriptDependencies;

  constructor(deps: GetCallTranscriptDependencies) {
    this.deps = deps;
  }

  // RF-1011, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly seq: number;
  }): Promise<Result<readonly StoredTranscriptEntry[], 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const scope = scopeOf(run);
    const call = (await this.deps.calls.log(scope)).find(request.seq);
    if (call === undefined) return err('not-found');
    // Every attempt of a logical call shares its call id, and so do the messages it added.
    const entries = await this.deps.calls.transcript(scope, call.agentTaskId);
    return ok(entries.filter((entry) => entry.callId === call.callId));
  }
}
