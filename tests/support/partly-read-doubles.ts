import type { Run } from '../../src/domain/runs/run.js';
import type {
  PartlyRead,
  ReadRunPartlyRead,
} from '../../src/application/use-cases/read-run-partly-read.js';

// P8-130: readers of what the run lists need, for tests that do not read coverage themselves.

export type PartlyReadReader = Pick<ReadRunPartlyRead, 'forListing'>;
type RunReader = PartlyReadReader;

/** A reader that finds no coverage, so no run reads "Partly read". */
export const noPartlyRead: RunReader = {
  forListing: () => ({ of: () => Promise.resolve({ areas: 0, share: null }) }),
};

/** A reader that gives each run the figures `figuresOf` says, and keeps the listings it was given. */
export function partlyReadOf(figuresOf: (run: Run) => PartlyRead): RunReader & {
  readonly listings: (readonly Run[])[];
} {
  const listings: (readonly Run[])[] = [];
  return {
    listings,
    forListing: (runs) => {
      listings.push(runs);
      return { of: (run) => Promise.resolve(figuresOf(run)) };
    },
  };
}
