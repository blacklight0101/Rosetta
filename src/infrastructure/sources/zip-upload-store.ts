import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { UploadSnapshot, UploadSnapshotInfo } from '../../application/ports/source-fetcher.js';
import type {
  StoredUpload,
  UploadRequest,
  UploadStore,
} from '../../application/ports/upload-store.js';
import type { ZipExtraction, ZipExtractor } from '../../application/ports/zip-extractor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  isUploadSnapshotKey,
  uploadKeyPrefix,
  uploadSnapshotKey,
} from '../../domain/sources/upload-name.js';
import { FileSnapshotCache } from '../files/file-snapshot-cache.js';
import { errorCode, snapshotWriteFailed } from '../github/snapshot-errors.js';
import { SnapshotStore } from '../github/snapshot-store.js';
import { receiveZip, uploadTimedOut, uploadTooLarge } from './upload-intake.js';

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

const DEFAULT_EXTRACT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_STALL_MS = 60_000;
/** DEC-149: an upload needs the archive and its unpacked tree, so twice the limit must be free. */
const FREE_SPACE_FACTOR = 2;
const PARTIAL_PREFIX = '.partial-';
const ZIP_FILE = 'upload.zip';
const FILES = 'files';

/** RST-1917: the data folder cannot hold the upload. */
function noSpace(requiredBytes: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.uploadNoSpace,
    `The data folder has less than ${String(requiredBytes)} bytes free.`,
  );
}

/** The error a stopped request should surface: its own reason when it has one. */
function stoppedBy(signal: AbortSignal, fallback: unknown): unknown {
  return signal.aborted && signal.reason instanceof Error ? signal.reason : fallback;
}

/**
 * Receives a zip, unpacks it and publishes it as `upload__<project id>@<16 hex>` under
 * `<data>/sources/` (RFC-004 section 4.2). All work happens in a `.partial-<id>` folder of its own,
 * renamed into place at the end and deleted on any failure; the extractor always gets a path that
 * does not exist yet.
 */
// RF-128, RF-129, RF-130
export class ZipUploadStore implements UploadStore {
  private readonly options: ZipUploadStoreOptions;
  private readonly snapshots: SnapshotStore;
  private readonly cache: FileSnapshotCache;
  /** Free bytes the uploads running now may still need, held back from the next check. */
  private reservedBytes = 0;

  constructor(options: ZipUploadStoreOptions) {
    this.options = options;
    this.snapshots = new SnapshotStore(options.dataDir);
    this.cache = new FileSnapshotCache(options.dataDir);
  }

  async store(request: UploadRequest): Promise<StoredUpload> {
    if (request.declaredBytes !== undefined && request.declaredBytes > request.limitBytes) {
      throw uploadTooLarge(request.limitBytes);
    }
    const reserved = request.limitBytes * FREE_SPACE_FACTOR;
    await this.reserveSpace(reserved);
    try {
      return await this.storeInPartial(request);
    } finally {
      this.reservedBytes -= reserved;
    }
  }

  private async storeInPartial(request: UploadRequest): Promise<StoredUpload> {
    const partial = join(this.snapshots.sourcesDir, `${PARTIAL_PREFIX}${randomUUID()}`);
    try {
      await mkdir(partial, { recursive: true }).catch((error: unknown) => {
        throw snapshotWriteFailed('folder could not be created', error);
      });
      return await this.build(partial, request);
    } catch (error) {
      await rm(partial, { recursive: true, force: true });
      throw error;
    }
  }

  async read(key: string): Promise<UploadSnapshot | undefined> {
    if (!isUploadSnapshotKey(key)) return undefined;
    const snapshot = await this.snapshots.readExisting(key);
    return snapshot?.kind === 'upload' ? snapshot : undefined;
  }

  remove(key: string): Promise<boolean> {
    return isUploadSnapshotKey(key) ? this.cache.remove(key) : Promise.resolve(false);
  }

  async removeAllOf(projectId: string): Promise<number> {
    const prefix = uploadKeyPrefix(projectId);
    let names: string[];
    try {
      names = await readdir(this.snapshots.sourcesDir);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return 0;
      throw snapshotWriteFailed('folder could not be listed', error);
    }
    let removed = 0;
    for (const name of names.filter((entry) => entry.startsWith(prefix))) {
      if (await this.remove(name)) removed += 1;
    }
    return removed;
  }

  /**
   * Checks the free space against what the uploads already running hold back (DEC-149), then holds
   * back this one's share. Nothing awaits between the check and the hold, so uploads that start
   * together cannot each pass against the same free bytes; the caller releases the share.
   */
  private async reserveSpace(requiredBytes: number): Promise<void> {
    const free = await (this.options.freeBytes ?? this.fileSystemFreeBytes.bind(this))();
    if (free - this.reservedBytes < requiredBytes) throw noSpace(requiredBytes);
    this.reservedBytes += requiredBytes;
  }

  private async fileSystemFreeBytes(): Promise<number> {
    try {
      await mkdir(this.options.dataDir, { recursive: true });
      const stats = await statfs(this.options.dataDir);
      return stats.bavail * stats.bsize;
    } catch (error) {
      throw snapshotWriteFailed('free space could not be read', error);
    }
  }

  private async build(partial: string, request: UploadRequest): Promise<StoredUpload> {
    const zipPath = join(partial, ZIP_FILE);
    const filesDir = join(partial, FILES);
    const zipBytes = await receiveZip(
      {
        body: request.body,
        limitBytes: request.limitBytes,
        stallMs: this.options.stallMs ?? DEFAULT_STALL_MS,
        signal: request.signal,
      },
      zipPath,
    );
    const extraction = await this.extract(zipPath, filesDir, request.signal);
    await rm(zipPath, { force: true });
    const summary = await this.snapshots.inspect(filesDir);
    const info: UploadSnapshotInfo = {
      kind: 'upload',
      fileName: request.fileName,
      uploadedAt: request.uploadedAt,
      ...summary,
      skippedLinks: extraction.skippedLinks + extraction.skippedDeviceNames,
    };
    const key = uploadSnapshotKey(request.projectId, summary.snapshotHash);
    await this.snapshots.writeInfo(partial, info);
    if (await this.snapshots.commit(partial, key)) {
      await this.snapshots.makeReadOnly(this.snapshots.snapshotDir(key));
    } else {
      // The same content is already stored: the newest upload names it (RF-128).
      await this.snapshots.rewriteInfo(key, info);
    }
    const skipped = info.skippedLinks + extraction.leftOutEntries;
    return { key, info, zipBytes, skipped };
  }

  /** Unpacks under the time bound; a stop by the request keeps its own reason (RST-1918 is the bound's). */
  private async extract(
    zipPath: string,
    filesDir: string,
    requestSignal: AbortSignal,
  ): Promise<ZipExtraction> {
    const bound = AbortSignal.timeout(this.options.extractTimeoutMs ?? DEFAULT_EXTRACT_TIMEOUT_MS);
    try {
      return await this.options.extractor.extract(
        zipPath,
        filesDir,
        AbortSignal.any([requestSignal, bound]),
      );
    } catch (error) {
      if (requestSignal.aborted) throw stoppedBy(requestSignal, error);
      if (bound.aborted) throw uploadTimedOut('unpacking');
      throw error;
    }
  }
}
