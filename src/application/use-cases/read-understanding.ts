import type { Actor } from '../../domain/accounts/actor.js';
import type { DeepenRecord } from '../../domain/deepen/deepen-record.js';
import type { UnderstandingMeasures } from '../../domain/deepen/understanding-measures.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import { thirdPartyAreaNames } from '../../domain/code-map/third-party.js';
import { measuresOf } from '../deepen/deepen-state.js';
import { latestScan, newestScan } from '../deepen/latest-scan.js';
import { scopeOf } from '../runs/run-scope.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ScanResults, ScannedSource } from '../ports/scan-results.js';
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

/** P8-130: what a list of runs reads of their measures, the scan they read opened once. */
export interface ListingMeasures {
  /** The names of the areas the code map calls third-party; none without a scan. */
  libraryAreas(): Promise<ReadonlySet<string>>;
  /** The first-party coverage of the run's measures; null when they cannot be worked out. */
  firstPartyShare(run: Run): Promise<number | null>;
}

type ScanOf = () => Promise<ScannedSource | undefined>;

/** RF-231: the measures of an ended understand run from its task results and the scan it read. */
async function measuresOfRun(
  taskResults: Pick<TaskResults, 'read'>,
  request: { readonly run: Run; readonly codemapHash: string | null; readonly scan: ScanOf },
): Promise<UnderstandingMeasures | null> {
  const { run, codemapHash } = request;
  const results = await taskResults.read(scopeOf(run));
  if (results.length === 0) return null;
  const scanned = await request.scan();
  if (scanned === undefined) return null;
  if (scanned.codeMapHash !== codemapHash) return null;
  return measuresOf({ results }, scanned.codeMap);
}

/** The result of a call kept for the next one, rejections included. */
function once<T>(make: () => Promise<T>): () => Promise<T> {
  let kept: Promise<T> | undefined;
  return () => {
    kept ??= make();
    return kept;
  };
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
    const scan = (): Promise<ScannedSource | undefined> => latestScan(this.deps, run);
    const codemapHash = manifest?.codemapHash ?? null;
    return ok({
      measures: await measuresOfRun(this.deps.taskResults, { run, codemapHash, scan }),
      deepen,
    });
  }

  /**
   * RF-231, P8-130: the figures of the runs of one listing (the history of a project). The scan they
   * read is the newest completed one among the runs in hand, so it is found without asking the index
   * again and its code map is opened once for the whole listing, however many rows ask. Each row still
   * reads its own manifest and task results.
   */
  forListing(runs: readonly Run[]): ListingMeasures {
    const scan = once(async () => {
      const newest = newestScan(runs);
      return newest === undefined ? undefined : this.deps.scans.open(newest);
    });
    return {
      libraryAreas: async () => {
        const scanned = await scan();
        return scanned === undefined ? new Set<string>() : thirdPartyAreaNames(scanned.codeMap);
      },
      firstPartyShare: async (run) => {
        const manifest = await this.deps.manifests.read(scopeOf(run));
        const codemapHash = manifest?.codemapHash ?? null;
        const measures = await measuresOfRun(this.deps.taskResults, { run, codemapHash, scan });
        return measures?.firstPartyCoverage ?? null;
      },
    };
  }
}
