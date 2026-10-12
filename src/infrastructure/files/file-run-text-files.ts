import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { RunTextFiles } from '../../application/ports/run-text-files.js';
import { runPath } from './workspace-paths.js';

// RF-504: the small text files of a run folder, read through the workspace guard, so a path that
// leaves the folder, names a link or is not a plain name reads as a file the run does not have.

export class FileRunTextFiles implements RunTextFiles {
  private readonly writer: Pick<OutputWriter, 'readText'>;

  constructor(writer: Pick<OutputWriter, 'readText'>) {
    this.writer = writer;
  }

  // RF-504
  async read(scope: RunScope, path: string): Promise<string | undefined> {
    const folder = runPath(scope.projectId, scope.runKey);
    const read = await this.writer.readText({ userId: scope.userId, path: `${folder}/${path}` });
    return read.ok ? read.value : undefined;
  }
}
