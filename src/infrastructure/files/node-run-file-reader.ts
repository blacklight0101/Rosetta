import type { RunScope } from '../../application/ports/run-events.js';
import type { RunFileContent, RunFileReader } from '../../application/ports/run-file-reader.js';
import { err, type Result } from '../../domain/errors/result.js';

// RF-504, RF-506, RF-1105, RF-005: reads one file of a run folder from the data folder.

export class NodeRunFileReader implements RunFileReader {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  open(scope: RunScope, path: string): Promise<Result<RunFileContent, 'not-found'>> {
    void scope;
    void path;
    void this.dataDir;
    return Promise.resolve(err('not-found'));
  }
}
