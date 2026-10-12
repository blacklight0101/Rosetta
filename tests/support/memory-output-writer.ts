import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../src/application/ports/output-writer.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { err, ok, type Result } from '../../src/domain/errors/result.js';

/** An OutputWriter that keeps files in memory, for unit tests of writers. */
export class MemoryOutputWriter implements OutputWriter {
  readonly files = new Map<string, string>();
  readonly writes: string[] = [];

  writeText(file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>> {
    this.files.set(file.path, content);
    this.writes.push(file.path);
    return Promise.resolve(ok(undefined));
  }

  appendLine(file: WorkspaceFile, line: string): Promise<Result<void, WriteRefusal>> {
    this.files.set(file.path, `${this.files.get(file.path) ?? ''}${line}\n`);
    return Promise.resolve(ok(undefined));
  }

  readText(file: WorkspaceFile): Promise<Result<string, WriteRefusal>> {
    const text = this.files.get(file.path);
    if (text === undefined) {
      return Promise.resolve(
        err({ code: ERROR_CODES.fileNotFound, reason: 'not-found', message: 'missing' }),
      );
    }
    return Promise.resolve(ok(text));
  }

  remove(file: WorkspaceFile): Promise<Result<void, WriteRefusal>> {
    this.files.delete(file.path);
    return Promise.resolve(ok(undefined));
  }
}
