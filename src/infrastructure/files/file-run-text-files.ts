import type { FileStatReader, OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { RunTextFiles } from '../../application/ports/run-text-files.js';
import { runPath } from './workspace-paths.js';

// RF-504: the small text files of a run folder, read through the workspace guard, so a path that
// leaves the folder, names a link or is not a plain name reads as a file the run does not have.
// P8-130: a caller that gives `maxBytes` never reads a larger file: its size is asked of the file
// system first, as the call log does (P5-22), and such a file reads as one the run does not have.

export class FileRunTextFiles implements RunTextFiles {
  private readonly writer: Pick<OutputWriter, 'readText'> & FileStatReader;

  constructor(writer: Pick<OutputWriter, 'readText'> & FileStatReader) {
    this.writer = writer;
  }

  // RF-504
  async read(scope: RunScope, path: string, maxBytes?: number): Promise<string | undefined> {
    const folder = runPath(scope.projectId, scope.runKey);
    const file = { userId: scope.userId, path: `${folder}/${path}` };
    if (maxBytes !== undefined) {
      const facts = await this.writer.statFile(file);
      if (!facts.ok || facts.value.size > maxBytes) return undefined;
    }
    const read = await this.writer.readText(file);
    return read.ok ? read.value : undefined;
  }
}
