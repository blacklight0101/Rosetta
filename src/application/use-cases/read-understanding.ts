import type { Actor } from '../../domain/accounts/actor.js';
import type { DeepenRecord } from '../../domain/deepen/deepen-record.js';
import type { UnderstandingMeasures } from '../../domain/deepen/understanding-measures.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import { measuresOf } from '../deepen/deepen-state.js';
import { latestScan } from '../deepen/latest-scan.js';
import { scopeOf } from '../runs/run-scope.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { TaskResults } from '../ports/task-results.js';

// RF-231, RF-209, RF-1105: Read understanding gives the run page what an ended understand run
// understood, in honest measures (first-party coverage by tokens, files not read, Supported share,
// not judged, rejected claims left, third-party code apart), and the record of its rounds when it is
// a Deepen run. The measures are worked out from the task results of the run and the code map of
// the scan it read; a code map that is not the one the run recorded would give other lines and
// other sizes, so there are no measures then. Another user's run id answers like an unknown one.

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
    const manifest = await this.deps.manifests.read(scopeOf(run));
    const deepen = manifest?.deepen ?? null;
    if (run.stage !== 'understand' || run.endState === null) return ok({ measures: null, deepen });
    return ok({ measures: await this.measuresOf(run, manifest?.codemapHash ?? null), deepen });
  }

  private async measuresOf(
    run: Run,
    codemapHash: string | null,
  ): Promise<UnderstandingMeasures | null> {
    const results = await this.deps.taskResults.read(scopeOf(run));
    if (results.length === 0) return null;
    const scanned = await latestScan(this.deps, run);
    if (scanned === undefined) return null;
    if (scanned.codeMapHash !== codemapHash) return null;
    return measuresOf({ results }, scanned.codeMap);
  }
}
