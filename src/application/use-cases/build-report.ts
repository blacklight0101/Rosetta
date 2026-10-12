import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { ReportWriter } from '../ports/report-writer.js';
import type { RunEventHistory, RunScope } from '../ports/run-events.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { buildReportModel } from '../report/build-report-model.js';
import type { ReportDocuments } from '../report/report-model.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-504, RF-506, RF-1013, RF-1105: Build report on a run. It gives the owner of a finished run its
// report: `report/report.md` linking the specification, every card, the coverage and the cost
// report, the same report as escaped static HTML, and the "Run replay" page made from
// `events.jsonl`. A run that is queued or running has no report yet (`in-progress`); another user's
// run id and an unknown id give the same answer, `not-found`. The report lists only the documents
// the run folder has, so a link never points at a missing file.

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
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<BuiltReport, BuildReportProblem>> {
    const { runs, manifests, history, writer } = this.deps;
    const run = await runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    if (run.queueState !== 'Ended') return err('in-progress');
    const scope = scopeOf(run);
    const model = buildReportModel({
      run,
      manifest: await manifests.read(scope),
      events: await history.read(scope, 0),
      cardIndex: await this.deps.files.read(scope, 'cards/index.json'),
      documents: await this.documentsOf(scope),
    });
    return ok({ files: await writer.write(scope, model) });
  }

  private async documentsOf(scope: RunScope): Promise<ReportDocuments> {
    const has = async (path: string): Promise<boolean> =>
      (await this.deps.files.read(scope, path)) !== undefined;
    return {
      spec: await has('spec.md'),
      coverage: await has('coverage.md'),
      cost: await has('cost.md'),
    };
  }
}
