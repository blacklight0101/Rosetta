import { Readable } from 'node:stream';
import type { RunScope } from '../../src/application/ports/run-events.js';
import type { RunFileContent, RunFileReader } from '../../src/application/ports/run-file-reader.js';
import { err, ok, type Result } from '../../src/domain/errors/result.js';
import { checkWorkspacePath } from '../../src/infrastructure/files/workspace-paths.js';

/** A RunFileReader over run folders kept in memory, for tests of the layers above it. */
export class MemoryRunFileReader implements RunFileReader {
  private readonly folders = new Map<string, Readonly<Record<string, string | Buffer>>>();

  /** Gives the run a folder with these files (`path` relative to the run folder). */
  seed(scope: RunScope, files: Readonly<Record<string, string | Buffer>>): void {
    this.folders.set(keyOf(scope), files);
  }

  open(scope: RunScope, path: string): Promise<Result<RunFileContent, 'not-found'>> {
    const content = checkWorkspacePath(path).ok
      ? this.folders.get(keyOf(scope))?.[path]
      : undefined;
    if (content === undefined) return Promise.resolve(err('not-found'));
    const bytes = typeof content === 'string' ? Buffer.from(content) : content;
    return Promise.resolve(
      ok({
        size: bytes.length,
        body: Readable.from([bytes]),
      }),
    );
  }
}

function keyOf(scope: RunScope): string {
  return [scope.userId, scope.projectId, scope.runKey].join('/');
}
