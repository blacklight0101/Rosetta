import { partlyReadAreas } from '../../domain/cards/partly-read.js';
import type { Run } from '../../domain/runs/run.js';
import type { Logger } from '../ports/logger.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { scopeOf } from '../runs/run-scope.js';
import { listingOf, type CoverageListing } from './read-run-coverage.js';
import type { ListingMeasures, ReadUnderstanding } from './read-understanding.js';

// RF-230, RF-1008, DEC-220 (P8-130): what the run lists need of a run to read the state its page reads:
// how many areas are below the coverage bar (from `coverage.json`, as the run page counts them, a
// third-party area of the scan's code map being no part of the count) and, only for a run that has
// some, the share of the first-party code it read (the figure of its measures). A run that is not an
// ended understand run that completed or stopped at its cap, or whose coverage is missing, torn, over
// the size limit or an old file without shares, makes no claim.
//
// One run that cannot be read never fails the list: a coverage file that cannot be read leaves the
// row its plain state, a share that cannot be worked out leaves "Partly read" without it (as the run
// page does), and a scan that cannot be opened leaves the library rule out; each is logged.
//
// Cost of a history of N rows: the code map of the scan is opened once; each ended understand row
// reads its `coverage.json` (at most `COVERAGE_MAX_BYTES`), and each row with an area below the bar
// also reads its manifest and its whole `task-results.json` (not capped: the run page reads the same
// file) and works its measures out. Nothing is kept between two requests of the history.

export interface PartlyRead {
  readonly areas: number;
  /** The share of first-party code read (0 to 1); null when the measures cannot be worked out. */
  readonly share: number | null;
}

export interface ReadRunPartlyReadDependencies {
  readonly files: RunTextFiles;
  readonly logger: Logger;
  readonly understanding: Pick<ReadUnderstanding, 'forListing'>;
}

/** The most bytes of a `coverage.json` a list reads; a larger file is no coverage Rosetta wrote. */
export const COVERAGE_MAX_BYTES = 16 * 1024 * 1024;

const NOTHING: PartlyRead = { areas: 0, share: null };

/** The page shows "Partly read" for an understand run that completed or stopped at its cap. */
function mayBePartlyRead(run: Run): boolean {
  if (run.stage !== 'understand' || run.queueState !== 'Ended') return false;
  return run.endState === 'Completed' || run.endState === 'CapReached';
}

export class ReadRunPartlyRead {
  private readonly deps: ReadRunPartlyReadDependencies;

  constructor(deps: ReadRunPartlyReadDependencies) {
    this.deps = deps;
  }

  /** RF-230: the reader of the rows of one history; the runs of the whole listing are given once. */
  forListing(runs: readonly Run[]): { of(run: Run): Promise<PartlyRead> } {
    const measures = this.deps.understanding.forListing(runs);
    return { of: (run) => this.rowOf(run, measures) };
  }

  private async rowOf(run: Run, measures: ListingMeasures): Promise<PartlyRead> {
    if (!mayBePartlyRead(run)) return NOTHING;
    const listing = await this.coverageOf(run);
    if (listing === undefined || partlyReadAreas(listing.areas) === 0) return NOTHING;
    const library = await this.guarded(run, 'the scan cannot be opened', measures.libraryAreas());
    const areas = partlyReadAreas(listing.areas, library ?? new Set());
    if (areas === 0) return NOTHING;
    const share = await this.guarded(
      run,
      'the measures cannot be worked out',
      measures.firstPartyShare(run),
    );
    return { areas, share: share ?? null };
  }

  private async coverageOf(run: Run): Promise<CoverageListing | undefined> {
    const read = this.deps.files.read(scopeOf(run), 'coverage.json', COVERAGE_MAX_BYTES);
    const text = await this.guarded(
      run,
      'the coverage file cannot be read',
      read.then((each) => each ?? null),
    );
    return text === undefined || text === null ? undefined : listingOf(text);
  }

  /** The value of a read that may fail; undefined, with a warning, when it did. */
  private async guarded<T>(run: Run, what: string, pending: Promise<T>): Promise<T | undefined> {
    try {
      return await pending;
    } catch (error) {
      await this.deps.logger.log({
        level: 'warn',
        logger: 'history',
        message: `Run ${run.runKey}: ${what}; it is listed with the state it has.`,
        ...{ userId: run.userId, runId: run.runKey },
        data: { reason: error instanceof Error ? error.message : 'unknown' },
      });
      return undefined;
    }
  }
}
