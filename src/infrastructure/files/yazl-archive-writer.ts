import { err, type Result } from '../../domain/errors/result.js';
import type {
  ArchivePart,
  ArchiveRefusal,
  ArchiveWriter,
} from '../../application/ports/archive-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';

export class YazlArchiveWriter implements ArchiveWriter {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  archive(
    _scope: RunScope,
    _part: ArchivePart,
  ): Promise<Result<AsyncIterable<Uint8Array>, ArchiveRefusal>> {
    void this.dataDir;
    return Promise.resolve(err('not-found'));
  }
}
