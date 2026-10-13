import type { Actor } from '../../domain/accounts/actor.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { RunCallReader, StoredTranscriptEntry } from '../ports/run-call-reader.js';
import type { RunIndex } from '../ports/run-index.js';

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
  execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly seq: number;
  }): Promise<Result<readonly StoredTranscriptEntry[], 'not-found'>> {
    void this.deps;
    void request;
    return Promise.resolve(err('not-found'));
  }
}
