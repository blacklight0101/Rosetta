import type { UploadSnapshotInfo } from '../../src/application/ports/source-fetcher.js';
import type {
  StoredUpload,
  UploadRequest,
  UploadStore,
} from '../../src/application/ports/upload-store.js';
import type { WorkbookEntry } from '../../src/domain/sources/source.js';
import type {
  LeftOut,
  WorkbookProgress,
  WorkbookSummaryLine,
} from '../../src/application/ports/workbook-staging.js';
import { uploadSnapshotKey } from '../../src/domain/sources/upload-name.js';

// RF-128: an upload store for use case tests. It records what it was asked, answers a stored upload
// built from the request, and can hold an upload open until the test lets it go.

export class FakeUploadStore implements UploadStore {
  readonly requests: UploadRequest[] = [];
  readonly removed: string[] = [];
  /** RF-128: the snapshots already stored; a store of one of them did not create it. */
  readonly existing = new Set<string>();
  /** RF-128: the keys whose description the newest upload of the same content rewrote. */
  readonly renamed: string[] = [];
  readonly removedProjects: string[] = [];
  failWith: Error | undefined;
  /** The reports `store` makes to the request's `onProgress`, before it waits for the gate (RF-159). */
  reports: WorkbookProgress[] = [];
  /** When set, `store` waits for it. */
  gate: Promise<void> | undefined;
  /** RF-159: once the gate lets go, a store whose request was aborted stops, as the real one does. */
  stopsOnAbort = false;
  /** RF-159, DEC-188: the store tells its caller that the zip holds workbooks, as the real one does. */
  announcesWorkbooks = false;
  hash = `sha256:${'ab'.repeat(32)}`;
  zipBytes = 1234;
  /** RF-152: the workbooks the zip held and the ones left out; none by default, as for most zips. */
  held: { entries: WorkbookEntry[]; lines: WorkbookSummaryLine[]; leftOut: LeftOut[] } | undefined;

  async store(request: UploadRequest): Promise<StoredUpload> {
    this.requests.push(request);
    // RF-159, DEC-188: a zip that holds workbooks is told to the caller before the heavy work starts.
    if (this.announcesWorkbooks) await request.onWorkbooks?.();
    await this.work(request);
    const info: UploadSnapshotInfo = {
      kind: 'upload',
      fileName: request.fileName,
      uploadedAt: request.uploadedAt,
      fileCount: 7,
      totalBytes: 4096,
      skippedLinks: 1,
      snapshotHash: this.hash,
      ...(this.held === undefined || this.held.entries.length === 0
        ? {}
        : { workbooks: this.held.entries }),
    };
    const key = uploadSnapshotKey(request.projectId, this.hash);
    const created = !this.existing.has(key);
    this.existing.add(key);
    return {
      key,
      info,
      created,
      zipBytes: this.zipBytes,
      skipped: 3,
      ...(this.held === undefined
        ? {}
        : { workbooks: this.held.lines, leftOut: this.held.leftOut }),
    };
  }

  /** The reports, the wait for the gate, a stop by the request and a failure the test asked for. */
  private async work(request: UploadRequest): Promise<void> {
    for (const report of this.reports) request.onProgress?.(report);
    if (this.gate !== undefined) await this.gate;
    if (this.stopsOnAbort && request.signal.aborted) {
      throw request.signal.reason instanceof Error ? request.signal.reason : new Error('stopped');
    }
    if (this.failWith !== undefined) throw this.failWith;
  }

  read(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  rewriteInfo(key: string): Promise<void> {
    this.renamed.push(key);
    return Promise.resolve();
  }

  remove(key: string): Promise<boolean> {
    this.removed.push(key);
    return Promise.resolve(true);
  }

  removeAllOf(projectId: string): Promise<number> {
    this.removedProjects.push(projectId);
    return Promise.resolve(1);
  }
}
