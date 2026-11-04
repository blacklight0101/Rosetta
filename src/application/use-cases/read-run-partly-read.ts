import { partlyReadAreas } from '../../domain/cards/partly-read.js';
import type { Run } from '../../domain/runs/run.js';
import type { Logger } from '../ports/logger.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { scopeOf } from '../runs/run-scope.js';
import { listingOf } from './read-run-coverage.js';
import type { ReadUnderstanding } from './read-understanding.js';

// RF-230, RF-1008, DEC-220 (P8-130): what the run lists need of a run to read the state its page reads.

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

/** The most bytes of a `coverage.json` a list reads. */
export const COVERAGE_MAX_BYTES = 0;

const NOTHING: PartlyRead = { areas: 0, share: null };

export class ReadRunPartlyRead {
  private readonly deps: ReadRunPartlyReadDependencies;

  constructor(deps: ReadRunPartlyReadDependencies) {
    this.deps = deps;
  }

  // RF-230
  forListing(runs: readonly Run[]): { of(run: Run): Promise<PartlyRead> } {
    const measures = this.deps.understanding.forListing(runs);
    return {
      of: async (run) => {
        const listing = listingOf(await this.deps.files.read(scopeOf(run), 'coverage.json'));
        const areas = partlyReadAreas(listing.areas);
        if (areas === 0) return NOTHING;
        return { areas, share: await measures.firstPartyShare(run) };
      },
    };
  }
}
