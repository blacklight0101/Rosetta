/* eslint-disable @typescript-eslint/no-unused-vars -- red stub, replaced by the implementation in the next commit */
import type { Actor } from '../../domain/accounts/actor.js';
import type { Overview } from '../../domain/overview/overview.js';
import { ok, type Result } from '../../domain/errors/result.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunTextFiles } from '../ports/run-text-files.js';

// RF-264: red stub, replaced by the implementation in the next commit.

export interface ReadOverviewDependencies {
  readonly runs: RunIndex;
  readonly files: RunTextFiles;
}

export class ReadOverview {
  constructor(readonly deps: ReadOverviewDependencies) {}

  execute(_request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<Overview | undefined, 'not-found'>> {
    return Promise.resolve(ok(undefined));
  }
}
