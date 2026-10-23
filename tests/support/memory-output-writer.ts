import type {
  FileFacts,
  FileStatReader,
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../src/application/ports/output-writer.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { err, ok, type Result } from '../../src/domain/errors/result.js';

const missing = (): Result<never, WriteRefusal> =>
  err({ code: ERROR_CODES.fileNotFound, reason: 'not-found', message: 'missing' });

/** An OutputWriter that keeps files in memory, for unit tests of writers. */
export class MemoryOutputWriter implements OutputWriter, FileStatReader {
  readonly files = new Map<string, string>();
  readonly writes: string[] = [];
  /** The path of every `readText`, in order, for tests that count reads. */
  readonly reads: string[] = [];
  /** How many times each path was changed: stands for the modification time. */
  private readonly versions = new Map<string, number>();

  private touch(path: string): void {
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
  }

  writeText(file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>> {
    this.files.set(file.path, content);
    this.writes.push(file.path);
    this.touch(file.path);
    return Promise.resolve(ok(undefined));
  }

  appendLine(file: WorkspaceFile, line: string): Promise<Result<void, WriteRefusal>> {
    this.files.set(file.path, `${this.files.get(file.path) ?? ''}${line}\n`);
    this.touch(file.path);
    return Promise.resolve(ok(undefined));
  }

  readText(file: WorkspaceFile): Promise<Result<string, WriteRefusal>> {
    this.reads.push(file.path);
    const text = this.files.get(file.path);
    if (text === undefined) return Promise.resolve(missing());
    return Promise.resolve(ok(text));
  }

  statFile(file: WorkspaceFile): Promise<Result<FileFacts, WriteRefusal>> {
    const text = this.files.get(file.path);
    if (text === undefined) return Promise.resolve(missing());
    return Promise.resolve(
      ok({ size: text.length, modifiedMs: this.versions.get(file.path) ?? 0 }),
    );
  }

  remove(file: WorkspaceFile): Promise<Result<void, WriteRefusal>> {
    this.files.delete(file.path);
    this.touch(file.path);
    return Promise.resolve(ok(undefined));
  }
}
