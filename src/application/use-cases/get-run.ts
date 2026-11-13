import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { holdingRunOf } from '../../domain/runs/queue-rules.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { readUnderstandOptions } from '../understand/understand-options.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-1002, RF-504, RF-1105: Get run gives the live run page what the event stream does not carry:
// the run's stage and queue state before its first event, its project, its totals so far and
// whether its report has been built (P1-130), so the Report step of the stepper is done on load.
// Only an ended run can have a report (DEC-131), so the folder of any other run is not read.
// A queued run also gets its place in the server's queue (RF-1108, P1-106). Another user's run id and
// an unknown id give the same answer.

/** Where a queued run stands in the server's queue (the run queue implements it). */
export interface QueuePositions {
  /** Counted from 1; undefined when the run is not queued. */
  positionOf(runId: string): Promise<number | undefined>;
}

/** The run a queued run waits for: its id (the page link) and its folder name (the words). */
interface WaitsFor {
  readonly id: string;
  readonly runId: string;
}

export interface GetRunDependencies {
  readonly runs: RunIndex;
  readonly queue: QueuePositions;
  /** Where the run folder is looked at for `report/report.md`. */
  readonly files: RunTextFiles;
  /** P8-11: where the cloud consent and the source run of the run are read; none reads neither. */
  readonly manifests?: RunManifestStore;
}

export interface RunDetail {
  readonly run: Run;
  /** True when the run folder holds the report that Build report writes (RF-504). */
  readonly reportBuilt: boolean;
  /** The place of a queued run in the server's queue, counted from 1; null for any other run. */
  readonly position: number | null;
  /** RF-1108, EV-106: the user's running run that holds this queued run back; null for any other. */
  readonly waitsFor: WaitsFor | null;
  /** P7-38: the cloud consent the run recorded in its manifest. */
  readonly cloudConsent: boolean;
  /** P7-25: for a plan run, the understand run it was made from. */
  readonly sourceRunId: string | null;
}

/** The file of `report/` that tells a report was built; the writer always writes it. */
const reportFile = 'report/report.md';

export class GetRun {
  private readonly deps: GetRunDependencies;

  constructor(deps: GetRunDependencies) {
    this.deps = deps;
  }

  // RF-1002, RF-504, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<RunDetail, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const [reportBuilt, position, waitsFor] = await Promise.all([
      this.reportBuilt(run),
      this.position(run),
      this.waitsForOf(run),
    ]);
    return ok({ run, reportBuilt, position, waitsFor, ...(await this.recorded(run)) });
  }

  /** RF-1108, EV-106: only a queued paid run can wait for the user's own running run. */
  private async waitsForOf(run: Run): Promise<WaitsFor | null> {
    if (run.queueState !== 'Queued') return null;
    const [queued, running] = await Promise.all([
      this.deps.runs.listQueued(),
      this.deps.runs.listRunning(),
    ]);
    const holder = holdingRunOf(queued, running, run.id);
    return holder === undefined ? null : { id: holder.id, runId: holder.runKey };
  }

  /** P7-38, P7-25: what the manifest recorded; none when there is no manifest store or file. */
  private async recorded(run: Run): Promise<Pick<RunDetail, 'cloudConsent' | 'sourceRunId'>> {
    const manifest = await this.deps.manifests?.read(scopeOf(run));
    if (manifest === undefined) return { cloudConsent: false, sourceRunId: null };
    const source: unknown = manifest.options['sourceRunId'];
    return {
      cloudConsent: readUnderstandOptions(manifest.options).cloudConsent,
      sourceRunId: typeof source === 'string' ? source : null,
    };
  }

  /** Only a queued run has a place; the queue is not asked about any other. */
  private async position(run: Run): Promise<number | null> {
    if (run.queueState !== 'Queued') return null;
    return (await this.deps.queue.positionOf(run.id)) ?? null;
  }

  private async reportBuilt(run: Run): Promise<boolean> {
    if (run.queueState !== 'Ended') return false;
    return (await this.deps.files.read(scopeOf(run), reportFile)) !== undefined;
  }
}
