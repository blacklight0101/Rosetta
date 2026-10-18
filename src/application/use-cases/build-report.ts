import type { Actor } from '../../domain/accounts/actor.js';
import type { Run } from '../../domain/runs/run.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { Clock } from '../ports/clock.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { ReportDownloads } from '../ports/report-downloads.js';
import type { ReportWriter } from '../ports/report-writer.js';
import type { ReportCardFiles } from '../ports/report-card-files.js';
import type { RunEventHistory, RunScope } from '../ports/run-events.js';
import type { Logger } from '../ports/logger.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { addEvidence } from '../report/card-evidence.js';
import { buildReportModel, type ReportInputs } from '../report/build-report-model.js';
import { parseCostReport, parseCoverage, projectTotalsOf } from '../report/report-extras.js';
import {
  parseCardIndex,
  type ReportDocuments,
  type ReportDownloadNames,
} from '../report/report-model.js';
import { diagramDocumentPaths, extractDiagrams } from '../report/report-diagrams.js';
import type { ScannedSource } from '../ports/scan-results.js';
import { scopeOf } from '../runs/run-scope.js';
import { exportFileName } from './export-zip.js';

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
  /** RF-500: the open questions of the run and their answers. */
  readonly answers: AnswersFile;
  /** RF-1010: the project totals at generation time. */
  readonly costs: CostTotals;
  readonly clock: Clock;
  /** RF-502: the card files read for the pages of the cards. */
  readonly cards: ReportCardFiles;
  /** RF-505: writes the zips "Download all" links, once the pages are written. */
  readonly downloads: ReportDownloads;
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
    const scanned = await this.scanOf(run);
    const downloads = await this.downloadsOf(run, scope);
    const cardIndex = await this.deps.files.read(scope, 'cards/index.json');
    const model = buildReportModel({
      run,
      manifest: await manifests.read(scope),
      events: await history.read(scope, 0),
      cardIndex,
      overviewFile: await this.deps.files.read(scope, 'overview.json'),
      documents: await this.documentsOf(scope),
      areas: scanned?.codeMap.areas.map(({ name, mapLevel }) => ({ name, mapLevel })) ?? [],
      cardDetails: await this.cardDetailsOf(scope, cardIndex, scanned),
      diagrams: await this.diagramsOf(scope),
      downloads,
      ...(await this.figuresOf(run, scope)),
    });
    const written = await writer.write(scope, model);
    await this.deps.downloads.write(scope, downloads);
    const zips =
      downloads.handoff === undefined ? [downloads.run] : [downloads.run, downloads.handoff];
    return ok({ files: [...written, ...zips.map((name) => `report/${name}`)] });
  }

  /** RF-505: the run zip always, the hand-off zip only when the run has a hand-off package. */
  private async downloadsOf(run: Run, scope: RunScope): Promise<ReportDownloadNames> {
    const handoff = await this.deps.files.read(scope, 'handoff/README.md');
    return {
      run: exportFileName(run.runKey, 'run'),
      ...(handoff === undefined ? {} : { handoff: exportFileName(run.runKey, 'handoff') }),
    };
  }

  /** RF-500, RF-1010: the figures of the dashboard, the questions and the cost page. */
  private async figuresOf(
    run: Run,
    scope: RunScope,
  ): Promise<
    Pick<ReportInputs, 'generatedAt' | 'coverage' | 'cost' | 'projectTotals' | 'questions'>
  > {
    const { files, answers, costs, clock } = this.deps;
    const questions = await answers.questionsOf(
      { userId: run.userId, projectId: run.projectId },
      run.runKey,
    );
    return {
      generatedAt: clock.now().toISOString(),
      coverage: parseCoverage(await files.read(scope, 'coverage.json')),
      cost: parseCostReport(await files.read(scope, 'cost.json')),
      projectTotals: projectTotalsOf(await costs.projectGroups(run.userId, run.projectId)),
      questions,
    };
  }

  /** RF-502: the cards that have a page, with the cited lines read from the scan's snapshot. */
  private async cardDetailsOf(
    scope: RunScope,
    cardIndex: string | undefined,
    scanned: ScannedSource | undefined,
  ): Promise<ReportInputs['cardDetails']> {
    const paths = parseCardIndex(cardIndex)
      .map((card) => card.path)
      .filter((path) => path !== '');
    const files = await this.deps.cards.read(scope, paths);
    return addEvidence(files, scanned?.reader);
  }

  /**
   * RF-112: the run's own scan, or the newest completed scan of its project: its code map gives the
   * areas and its snapshot the cited lines. Undefined when there is none or its output is gone.
   */
  private async scanOf(run: Run): Promise<ScannedSource | undefined> {
    const { scans, runs } = this.deps;
    const own = run.stage === 'scan' ? run : undefined;
    const scan =
      own ??
      (await runs.list(run.userId, run.projectId)).find(
        (each) => each.stage === 'scan' && each.endState === 'Completed',
      );
    if (scan === undefined) return undefined;
    try {
      return await scans.open(scan);
    } catch (error) {
      // The scan's output is gone or fails its check: the report is still worth building without it.
      await this.logUnreadable(run, scan, error);
      return undefined;
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

  /** RF-508: the Mermaid diagrams of the documents of the run: the specification, the data model and the package. */
  private async diagramsOf(scope: RunScope): Promise<ReturnType<typeof extractDiagrams>> {
    const { files } = this.deps;
    const flows = await files.read(scope, 'handoff/flows/README.md');
    const texts: Record<string, string> = {};
    for (const path of diagramDocumentPaths(flows)) {
      const text = await files.read(scope, path);
      if (text !== undefined) texts[path] = text;
    }
    return extractDiagrams(texts);
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
