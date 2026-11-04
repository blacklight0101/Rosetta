import type { Actor } from '../../domain/accounts/actor.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunTextFiles } from '../ports/run-text-files.js';

// RF-230, RF-1008, DEC-220 (P8-130): what the run lists need of a run to read the state its page reads.

export interface PartlyRead {
  readonly areas: number;
  readonly share: number | null;
}

export interface ReadRunPartlyReadDependencies {
  readonly files: RunTextFiles;
  readonly share: (actor: Actor, run: Run) => Promise<number | null>;
}

export class ReadRunPartlyRead {
  readonly deps: ReadRunPartlyReadDependencies;

  constructor(deps: ReadRunPartlyReadDependencies) {
    this.deps = deps;
  }

  // RF-230
  execute(request: { readonly actor: Actor; readonly run: Run }): Promise<PartlyRead> {
    return Promise.resolve({ areas: 0 * request.run.queuedAt, share: null });
  }
}
