import type { Actor } from '../../domain/accounts/actor.js';
import type { Run } from '../../domain/runs/run.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { ReportWriter } from '../ports/report-writer.js';
import type { RunEventHistory, RunScope } from '../ports/run-events.js';
import type { Logger } from '../ports/logger.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { buildReportModel } from '../report/build-report-model.js';
import type { ReportArea, ReportDocuments } from '../report/report-model.js';
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
  /** Where the map level of the areas is read (RF-112). */
  readonly scans: ScanResults;
  readonly logger: Logger;
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
      areas: await this.areasOf(run),
    });
    return ok({ files: await writer.write(scope, model) });
  }

  /** RF-112: the areas of the run's own scan, or of the newest completed scan of its project. */
  private async areasOf(run: Run): Promise<readonly ReportArea[]> {
    const { scans, runs } = this.deps;
    const own = run.stage === 'scan' ? run : undefined;
    const scan =
      own ??
      (await runs.list(run.userId, run.projectId)).find(
        (each) => each.stage === 'scan' && each.endState === 'Completed',
      );
    if (scan === undefined) return [];
    try {
      const { codeMap } = await scans.open(scan);
      return codeMap.areas.map(({ name, mapLevel }) => ({ name, mapLevel }));
    } catch (error) {
      // The scan's output is gone or fails its check: the report is still worth building without it.
      await this.logUnreadable(run, scan, error);
      return [];
    }
  }

  private async logUnreadable(run: Run, scan: Run, error: unknown): Promise<void> {
    await this.deps.logger.log({
      level: 'warn',
      logger: 'report',
      code: error instanceof RosettaError ? error.code : ERROR_CODES.codeMapMissing,
      message: 'The scan output could not be read, so the report lists no areas.',
      runId: run.id,
      data: { scanRunId: scan.id },
    });
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
