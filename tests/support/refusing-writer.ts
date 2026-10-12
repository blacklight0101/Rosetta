import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../src/application/ports/output-writer.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { err, type Result } from '../../src/domain/errors/result.js';

/** How the wrapped writer misbehaves once the n-th `writeText` (1-based) has been refused. */
export type AfterRefusal = 'restores' | 'refuses-restores' | 'throws-on-restore';

const refusal: WriteRefusal = {
  code: ERROR_CODES.pathOutsideRoot,
  reason: 'outside-workspace',
  message: 'no',
};

/**
 * Wraps a writer and refuses its n-th `writeText` as the workspace guard would; every other call
 * reaches the wrapped writer. After the refusal it can also fail the writes and removals that
 * restore the earlier files.
 */
export class RefusingWriter implements OutputWriter {
  private count = 0;
  private refused = false;
  private readonly inner: OutputWriter;
  private readonly refuseAt: number;
  private readonly after: AfterRefusal;

  private readonly throws: boolean;

  /** With `throws`, the n-th write throws (a disk error) instead of being refused. */
  constructor(
    inner: OutputWriter,
    refuseAt: number,
    after: AfterRefusal = 'restores',
    throws = false,
  ) {
    this.inner = inner;
    this.refuseAt = refuseAt;
    this.after = after;
    this.throws = throws;
  }

  writeText(file: WorkspaceFile, content: string): Promise<Result<void, WriteRefusal>> {
    this.count += 1;
    if (this.count === this.refuseAt) {
      this.refused = true;
      if (this.throws) return Promise.reject(new Error('disk full'));
      return Promise.resolve(err(refusal));
    }
    if (this.failsRestore()) return Promise.resolve(err(refusal));
    if (this.throwsRestore()) return Promise.reject(new Error('disk gone'));
    return this.inner.writeText(file, content);
  }

  appendLine(file: WorkspaceFile, line: string): Promise<Result<void, WriteRefusal>> {
    return this.inner.appendLine(file, line);
  }

  readText(file: WorkspaceFile): Promise<Result<string, WriteRefusal>> {
    return this.inner.readText(file);
  }

  remove(file: WorkspaceFile): Promise<Result<void, WriteRefusal>> {
    if (this.failsRestore()) return Promise.resolve(err(refusal));
    if (this.throwsRestore()) return Promise.reject(new Error('disk gone'));
    return this.inner.remove(file);
  }

  private failsRestore(): boolean {
    return this.refused && this.after === 'refuses-restores';
  }

  private throwsRestore(): boolean {
    return this.refused && this.after === 'throws-on-restore';
  }
}
