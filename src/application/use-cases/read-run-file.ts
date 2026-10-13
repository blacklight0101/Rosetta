import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { RunFileContent, RunFileReader } from '../ports/run-file-reader.js';
import type { RunIndex } from '../ports/run-index.js';
import { kindOfRunFile, type RunFileKind } from '../runs/run-file-kind.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-504, RF-506, RF-507, RF-1013, RF-1105: Read run file gives the owner of a run one file of its
// folder, with the way to serve it (text or page inline, anything else as a download). A run that
// is still running can be read: its files are the live record. Another user's run id, an unknown id
// and a path that is not a plain file of the folder all give the same answer, `not-found`.

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
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly path: string;
  }): Promise<Result<RunFileResponse, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const opened = await this.deps.files.open(scopeOf(run), request.path);
    if (!opened.ok) return err('not-found');
    const fileName = request.path.slice(request.path.lastIndexOf('/') + 1);
    return ok({ ...kindOfRunFile(request.path), ...opened.value, fileName });
  }
}
