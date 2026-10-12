import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import { recordManifestScan } from '../../domain/runs/run-manifest.js';
import type { Clock } from '../ports/clock.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ScanPipeline } from '../ports/scan-pipeline.js';
import type { Snapshot, SourceFetcher } from '../ports/source-fetcher.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-003, RF-005, RF-100, RF-121, RF-126, ADR-004, ADR-012: Run scan is the executor of the `scan`
// stage. It fetches the pinned snapshot, records the source in the run row and the manifest, runs the
// scan pipeline (which writes `codemap.json` and `scan-summary.md` into the run folder), records the
// code map hash and publishes the progress as run events. The abort signal is checked after every
// step, so a stopped run ends as `Interrupted` before it starts the next one. A failure with a code
// ends the run as `Failed` with that code; the queue records the end and publishes `run.ended`.

export interface RunScanDependencies {
  readonly fetcher: SourceFetcher;
  readonly projects: ProjectRepository;
  readonly pipeline: ScanPipeline;
  readonly manifests: RunManifestStore;
  readonly clock: Clock;
}

const INTERRUPTED: RunOutcome = { endState: 'Interrupted' };

export class RunScan implements RunExecutor {
  private readonly deps: RunScanDependencies;

  constructor(deps: RunScanDependencies) {
    this.deps = deps;
  }

  // RF-003, RF-1108
  async execute(execution: RunExecution): Promise<RunOutcome> {
    try {
      return await this.scan(execution);
    } catch (error) {
      // A stop can surface as the abort error of the step it interrupted.
      if (execution.signal.aborted) return INTERRUPTED;
      if (error instanceof RosettaError) return { endState: 'Failed', errorCode: error.code };
      throw error;
    }
  }

  private async scan(execution: RunExecution): Promise<RunOutcome> {
    const { run, signal } = execution;
    const project = await this.deps.projects.find(run.userId, run.projectId);
    if (project === undefined) return { endState: 'Failed', errorCode: ERROR_CODES.notFound };
    const snapshot = await this.fetch(execution);
    if (signal.aborted) return INTERRUPTED;
    const { subpath } = execution.manifest.source;
    const report = await this.deps.pipeline.scan({
      scope: scopeOf(run),
      root: snapshot.rootDir,
      source: {
        owner: snapshot.owner,
        repo: snapshot.repo,
        commitSha: snapshot.commitSha,
        subpath,
      },
      settings: project.settings.scan,
      signal,
    });
    if (signal.aborted) return INTERRUPTED;
    await this.recordScan(run, report.codeMapHash, snapshot.skippedLinks);
    await execution.events.emit('scan.completed', {
      files: report.files,
      areas: report.areas,
      mapLevels: report.mapLevels,
    });
    return { endState: 'Completed' };
  }

  /** Fetches the snapshot, records the source (RF-126) and publishes the two source events. */
  private async fetch(execution: RunExecution): Promise<Snapshot> {
    const { source } = execution.manifest;
    const began = this.deps.clock.now().getTime();
    const snapshot = await this.deps.fetcher.fetch(
      {
        owner: source.owner,
        repo: source.repo,
        ref: source.ref === '' ? undefined : source.ref,
        subpath: source.subpath === '' ? undefined : source.subpath,
      },
      execution.signal,
    );
    await execution.recordSource({
      commitSha: snapshot.commitSha,
      snapshotKey: snapshot.key,
      snapshotHash: snapshot.snapshotHash,
    });
    await execution.events.emit('source.resolved', {
      url: snapshot.url,
      ref: snapshot.resolvedFrom,
      commitSha: snapshot.commitSha,
    });
    await execution.events.emit('source.downloaded', {
      fileCount: snapshot.fileCount,
      totalBytes: snapshot.totalBytes,
      durationMs: this.deps.clock.now().getTime() - began,
      cached: snapshot.cached,
    });
    return snapshot;
  }

  private async recordScan(run: Run, codemapHash: string, skippedLinks: number): Promise<void> {
    const { manifests } = this.deps;
    const scope = scopeOf(run);
    const stored = await manifests.read(scope);
    if (stored === undefined) return;
    const recorded = recordManifestScan(stored, { codemapHash, skippedLinks });
    if (recorded.ok) await manifests.write(scope, recorded.value);
  }
}
