import type { Actor } from '../../domain/accounts/actor.js';
import { partlyReadAreas } from '../../domain/cards/partly-read.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { scopeOf } from '../runs/run-scope.js';
import { listingOf } from './read-run-coverage.js';
import type { ReadUnderstanding } from './read-understanding.js';

// RF-230, RF-1008, DEC-220 (P8-130): what the run lists need of a run to read the state its page reads:
// how many areas are below the coverage bar (from `coverage.json`, as the run page counts them) and,
// only for a run that has some, the share of the first-party code it read (the figure of its measures).
// A run that is not an ended understand run that completed or stopped at its cap, or whose coverage is
// missing, torn or an old file without shares, makes no claim.

export interface PartlyRead {
  readonly areas: number;
  /** The share of first-party code read (0 to 1); null when the measures cannot be worked out. */
  readonly share: number | null;
}

export interface ReadRunPartlyReadDependencies {
  readonly files: RunTextFiles;
  /** The first-party coverage of the run's measures, null when there are none. */
  readonly share: (actor: Actor, run: Run) => Promise<number | null>;
}

const NOTHING: PartlyRead = { areas: 0, share: null };

/** The page shows "Partly read" for an understand run that completed or stopped at its cap. */
function mayBePartlyRead(run: Run): boolean {
  if (run.stage !== 'understand' || run.queueState !== 'Ended') return false;
  return run.endState === 'Completed' || run.endState === 'CapReached';
}

/** RF-231: the first-party coverage of a run, as the run page reads it from the same use case. */
export function shareOfUnderstanding(
  read: Pick<ReadUnderstanding, 'execute'>,
): ReadRunPartlyReadDependencies['share'] {
  return async (actor, run) => {
    const outcome = await read.execute({ actor, runId: run.id });
    return outcome.ok ? (outcome.value.measures?.firstPartyCoverage ?? null) : null;
  };
}

export class ReadRunPartlyRead {
  private readonly deps: ReadRunPartlyReadDependencies;

  constructor(deps: ReadRunPartlyReadDependencies) {
    this.deps = deps;
  }

  // RF-230
  async execute(request: { readonly actor: Actor; readonly run: Run }): Promise<PartlyRead> {
    const { actor, run } = request;
    if (!mayBePartlyRead(run)) return NOTHING;
    const listing = listingOf(await this.deps.files.read(scopeOf(run), 'coverage.json'));
    const areas = partlyReadAreas(listing.areas);
    if (areas === 0) return NOTHING;
    return { areas, share: await this.deps.share(actor, run) };
  }
}
