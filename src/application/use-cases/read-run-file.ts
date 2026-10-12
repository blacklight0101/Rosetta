import type { Actor } from '../../domain/accounts/actor.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { RunFileContent, RunFileReader } from '../ports/run-file-reader.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunFileKind } from '../runs/run-file-kind.js';

// RF-504, RF-506, RF-1105: Read run file.

export interface ReadRunFileDependencies {
  readonly runs: RunIndex;
  readonly files: RunFileReader;
}

export interface RunFileResponse extends RunFileKind, RunFileContent {
  /** The last name of the path: plain characters only, safe in a `Content-Disposition` header. */
  readonly fileName: string;
}

export class ReadRunFile {
  private readonly deps: ReadRunFileDependencies;

  constructor(deps: ReadRunFileDependencies) {
    this.deps = deps;
  }

  // RF-504, RF-506, RF-1105
  execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly path: string;
  }): Promise<Result<RunFileResponse, 'not-found'>> {
    void request;
    void this.deps;
    return Promise.resolve(err('not-found'));
  }
}
