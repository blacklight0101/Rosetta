import { PassThrough } from 'node:stream';
import { ZipFile } from 'yazl';
import type {
  ArchivePart,
  ArchiveRefusal,
  ArchiveWriter,
} from '../../src/application/ports/archive-writer.js';
import type { RunScope } from '../../src/application/ports/run-events.js';
import { err, ok, type Result } from '../../src/domain/errors/result.js';

/** RF-505: the zips of the report, which the archive of the run leaves out. */
const REPORT_ZIP = /^report\/[^/]+\.zip(\.part)?$/u;

/** An ArchiveWriter over run folders kept in memory, for tests of the layers above it. */
export class MemoryArchiveWriter implements ArchiveWriter {
  private readonly folders = new Map<string, Readonly<Record<string, string>>>();

  /** Gives the run a folder with these files (`path` relative to the run folder). */
  seed(scope: RunScope, files: Readonly<Record<string, string>>): void {
    this.folders.set(keyOf(scope), files);
  }

  archive(
    scope: RunScope,
    part: ArchivePart,
  ): Promise<Result<AsyncIterable<Uint8Array>, ArchiveRefusal>> {
    const files = this.folders.get(keyOf(scope));
    const root = part === 'run' ? `${scope.runKey}/` : 'handoff/';
    const wanted = Object.entries(files ?? {}).filter(([path]) =>
      part === 'run' ? !REPORT_ZIP.test(path) : path.startsWith('handoff/'),
    );
    if (files === undefined || wanted.length === 0) return Promise.resolve(err('not-found'));
    const zip = new ZipFile();
    for (const [path, content] of wanted) {
      const name = part === 'run' ? `${root}${path}` : path;
      zip.addBuffer(Buffer.from(content), name);
    }
    zip.end();
    return Promise.resolve(ok(zip.outputStream.pipe(new PassThrough())));
  }
}

function keyOf(scope: RunScope): string {
  return [scope.userId, scope.projectId, scope.runKey].join('/');
}
