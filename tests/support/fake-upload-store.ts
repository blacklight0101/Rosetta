import type { UploadSnapshotInfo } from '../../src/application/ports/source-fetcher.js';
import type {
  StoredUpload,
  UploadRequest,
  UploadStore,
} from '../../src/application/ports/upload-store.js';
import { uploadSnapshotKey } from '../../src/domain/sources/upload-name.js';

// RF-128: an upload store for use case tests. It records what it was asked, answers a stored upload
// built from the request, and can hold an upload open until the test lets it go.

export class FakeUploadStore implements UploadStore {
  readonly requests: UploadRequest[] = [];
  readonly removed: string[] = [];
  readonly removedProjects: string[] = [];
  failWith: Error | undefined;
  /** When set, `store` waits for it. */
  gate: Promise<void> | undefined;
  hash = `sha256:${'ab'.repeat(32)}`;
  zipBytes = 1234;

  async store(request: UploadRequest): Promise<StoredUpload> {
    this.requests.push(request);
    if (this.gate !== undefined) await this.gate;
    if (this.failWith !== undefined) throw this.failWith;
    const info: UploadSnapshotInfo = {
      kind: 'upload',
      fileName: request.fileName,
      uploadedAt: request.uploadedAt,
      fileCount: 7,
      totalBytes: 4096,
      skippedLinks: 1,
      snapshotHash: this.hash,
    };
    return {
      key: uploadSnapshotKey(request.projectId, this.hash),
      info,
      zipBytes: this.zipBytes,
      skipped: 3,
    };
  }

  read(): Promise<undefined> {
    return Promise.resolve(undefined);
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
