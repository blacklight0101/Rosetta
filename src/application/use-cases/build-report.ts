import type { Actor } from '../../domain/accounts/actor.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { ReportWriter } from '../ports/report-writer.js';
import type { RunEventHistory } from '../ports/run-events.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunTextFiles } from '../ports/run-text-files.js';

// RF-504, RF-506, RF-1013, RF-1105: Build report on a run.

export interface BuildReportDependencies {
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly history: RunEventHistory;
  readonly files: RunTextFiles;
  readonly writer: ReportWriter;
}

export interface BuiltReport {
  /** The files written, relative to the run folder. */
  readonly files: readonly string[];
}

export type BuildReportProblem = 'not-found' | 'in-progress';

export class BuildReport {
  private readonly deps: BuildReportDependencies;

  constructor(deps: BuildReportDependencies) {
    this.deps = deps;
  }

  // RF-504, RF-506, RF-1105
  execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<BuiltReport, BuildReportProblem>> {
    void request;
    void this.deps;
    return Promise.resolve(err('not-found'));
  }
}

