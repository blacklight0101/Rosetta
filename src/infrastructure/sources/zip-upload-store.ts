import type { ZipExtractor } from '../../application/ports/zip-extractor.js';
import type {
  StoredUpload,
  UploadRequest,
  UploadStore,
} from '../../application/ports/upload-store.js';
import type { UploadSnapshot } from '../../application/ports/source-fetcher.js';

export interface ZipUploadStoreOptions {
  readonly dataDir: string;
  readonly extractor: ZipExtractor;
  /** Free bytes of the data folder; the file system's by default. */
  readonly freeBytes?: () => Promise<number>;
  /** How long unpacking may take. */
  readonly extractTimeoutMs?: number;
  /** How long the body may stay silent. */
  readonly stallMs?: number;
}

function notYet(what: unknown): Promise<never> {
  return Promise.reject(new Error(`not implemented: ${typeof what}`));
}

// RF-128, RF-129, RF-130
export class ZipUploadStore implements UploadStore {
  readonly options: ZipUploadStoreOptions;

  constructor(options: ZipUploadStoreOptions) {
    this.options = options;
  }

  store(request: UploadRequest): Promise<StoredUpload> {
    return notYet(request);
  }

  read(key: string): Promise<UploadSnapshot | undefined> {
    return notYet(key);
  }

  remove(key: string): Promise<boolean> {
    return notYet(key);
  }

  removeAllOf(projectId: string): Promise<number> {
    return notYet(projectId);
  }
}
