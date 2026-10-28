import { createHash } from 'node:crypto';
import type {
  PublishedWorkbooks,
  PublishRequest,
  ReceiveRequest,
  StagedFile,
  WorkbookProgress,
  WorkbookStaging,
} from '../../src/application/ports/workbook-staging.js';
import { workbookSnapshotKey } from '../../src/domain/sources/workbook-key.js';

// RF-150: a staging area for the tests of the batch use case. It keeps what it was asked, counts the
// bytes of each body, and publishes a snapshot built from the files it holds. A test can make a step
// fail, or hold a file open until it lets it go.

export class FakeWorkbookStaging implements WorkbookStaging {
  readonly opened: number[] = [];
  readonly discarded: string[] = [];
  readonly received: (ReceiveRequest & { readonly id: string })[] = [];
  readonly published: string[] = [];
  readonly held = new Map<string, StagedFile[]>();
  receiveFails: Error | undefined;
  publishFails: Error | undefined;
  /** Runs while a batch is being published, for a change that happens meanwhile. */
  duringPublish: (() => Promise<void>) | undefined;
  /** The reports `publish` makes to the request's `onProgress`, before `duringPublish` (RF-159). */
  reports: WorkbookProgress[] = [];
  /** When set, `receive` waits for it. */
  gate: Promise<void> | undefined;
  private counter = 0;

  open(limitBytes: number): Promise<string> {
    this.counter += 1;
    const id = `00000000-0000-4000-b000-${String(this.counter).padStart(12, '0')}`;
    this.opened.push(limitBytes);
    this.held.set(id, []);
    return Promise.resolve(id);
  }

  async receive(id: string, request: ReceiveRequest): Promise<StagedFile> {
    this.received.push({ ...request, id });
    if (this.gate !== undefined) await this.gate;
    if (this.receiveFails !== undefined) throw this.receiveFails;
    let size = 0;
    for await (const chunk of request.body) size += chunk.length;
    const file = { name: request.fileName, size };
    this.held.get(id)?.push(file);
    return file;
  }

  async publish(id: string, request: PublishRequest): Promise<PublishedWorkbooks> {
    this.published.push(id);
    for (const report of this.reports) request.onProgress?.(report);
    await this.duringPublish?.();
    if (request.signal.aborted) {
      this.held.delete(id);
      throw request.signal.reason instanceof Error ? request.signal.reason : new Error('stopped');
    }
    if (this.publishFails !== undefined) {
      this.held.delete(id);
      throw this.publishFails;
    }
    const files = this.held.get(id) ?? [];
    this.held.delete(id);
    const hash = `sha256:${createHash('sha256')
      .update(files.map((f) => f.name).join('|'))
      .digest('hex')}`;
    const workbooks = files.map((file) => ({
      fileName: file.name,
      folder: file.name,
      sizeBytes: file.size,
      sha256: `sha256:${'cd'.repeat(32)}`,
      counts: { sheets: 2, nonEmptyCells: 30, formulas: 4, macroModules: 0, macrosSkipped: 0 },
    }));
    return {
      key: workbookSnapshotKey(request.projectId, hash),
      info: {
        kind: 'workbook',
        uploadedAt: request.uploadedAt,
        rendererVersion: '1',
        workbooks,
        fileCount: files.length * 3,
        totalBytes: 100,
        skippedLinks: 0,
        snapshotHash: hash,
      },
      summary: files.map((file) => ({
        name: file.name,
        sheets: 2,
        cells: 30,
        formulas: 4,
        macroModules: 0,
      })),
      skipped: [],
    };
  }

  discard(id: string): Promise<void> {
    this.discarded.push(id);
    this.held.delete(id);
    return Promise.resolve();
  }
}
