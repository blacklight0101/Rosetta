import type { Actor } from '../../domain/accounts/actor.js';
import type { DeepenRecord } from '../../domain/deepen/deepen-record.js';
import type { UnderstandingMeasures } from '../../domain/deepen/understanding-measures.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { TaskResults } from '../ports/task-results.js';

// RF-231, RF-209, RF-1105: stub.

export interface Understanding {
  readonly measures: UnderstandingMeasures | null;
  readonly deepen: DeepenRecord | null;
}

export interface ReadUnderstandingDependencies {
  readonly runs: Pick<RunIndex, 'find' | 'list'>;
  readonly scans: ScanResults;
  readonly taskResults: Pick<TaskResults, 'read'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
}

export class ReadUnderstanding {
  private readonly deps: ReadUnderstandingDependencies;

  constructor(deps: ReadUnderstandingDependencies) {
    this.deps = deps;
  }

  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<Understanding, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    return ok({ measures: null, deepen: null });
  }
}
