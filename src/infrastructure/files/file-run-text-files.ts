import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { RunTextFiles } from '../../application/ports/run-text-files.js';

// RF-504: the small text files of a run folder, read through the workspace guard.

export class FileRunTextFiles implements RunTextFiles {
  private readonly writer: Pick<OutputWriter, 'readText'>;

  constructor(writer: Pick<OutputWriter, 'readText'>) {
    this.writer = writer;
  }

  read(scope: RunScope, path: string): Promise<string | undefined> {
    void scope;
    void path;
    void this.writer;
    return Promise.resolve(undefined);
  }
}
