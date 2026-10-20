import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { SentSnapshot, UploadSnapshotInfo } from '../../application/ports/source-fetcher.js';
import type {
  StoredUpload,
  UploadRequest,
  UploadStore,
} from '../../application/ports/upload-store.js';
import type { ZipExtraction, ZipExtractor } from '../../application/ports/zip-extractor.js';
import {
  isUploadSnapshotKey,
  uploadKeyPrefix,
  uploadSnapshotKey,
} from '../../domain/sources/upload-name.js';
import { isWorkbookSnapshotKey, workbookKeyPrefix } from '../../domain/sources/workbook-key.js';
import { FileSnapshotCache } from '../files/file-snapshot-cache.js';
import { errorCode, snapshotWriteFailed } from '../github/snapshot-errors.js';
import { SnapshotStore } from '../github/snapshot-store.js';
import { SpaceReservation } from './space-reservation.js';
import type { WorkbookLimits } from './workbook/workbook-limits.js';
import { receiveZip, uploadTimedOut, uploadTooLarge } from './upload-intake.js';

export interface ZipUploadStoreOptions {
  readonly dataDir: string;
  readonly extractor: ZipExtractor;
  /** Free bytes of the data folder, for a reservation of its own; the file system's by default. */
  readonly freeBytes?: () => Promise<number>;
  /** The reservation of free space the other uploads share (DEC-149); one of its own by default. */
  readonly reservation?: SpaceReservation;
  /** RF-151: the limits of the workbooks a zip holds; the defaults when absent. */
  readonly workbookLimits?: WorkbookLimits;
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
  private readonly reservation: SpaceReservation;

  constructor(options: ZipUploadStoreOptions) {
    this.options = options;
    this.snapshots = new SnapshotStore(options.dataDir);
    this.cache = new FileSnapshotCache(options.dataDir);
    this.reservation =
      options.reservation ??
      new SpaceReservation({
        dataDir: options.dataDir,
        ...(options.freeBytes === undefined ? {} : { freeBytes: options.freeBytes }),
      });
  }

  async store(request: UploadRequest): Promise<StoredUpload> {
    if (request.declaredBytes !== undefined && request.declaredBytes > request.limitBytes) {
      throw uploadTooLarge(request.limitBytes);
    }
    const release = await this.reservation.reserve(request.limitBytes * FREE_SPACE_FACTOR);
    try {
      return await this.storeInPartial(request);
    } finally {
      release();
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

  // RF-128, RF-152: the key of a zip reads a zip snapshot, the key of workbooks a workbook one.
  async read(key: string): Promise<SentSnapshot | undefined> {
    const wanted = isUploadSnapshotKey(key)
      ? 'upload'
      : isWorkbookSnapshotKey(key)
        ? 'workbook'
        : '';
    if (wanted === '') return undefined;
    const snapshot = await this.snapshots.readExisting(key);
    return snapshot?.kind === wanted ? snapshot : undefined;
  }

  remove(key: string): Promise<boolean> {
    const mine = isUploadSnapshotKey(key) || isWorkbookSnapshotKey(key);
    return mine ? this.cache.remove(key) : Promise.resolve(false);
  }

  async removeAllOf(projectId: string): Promise<number> {
    const prefixes = [uploadKeyPrefix(projectId), workbookKeyPrefix(projectId)];
    let names: string[];
    try {
      names = await readdir(this.snapshots.sourcesDir);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return 0;
      throw snapshotWriteFailed('folder could not be listed', error);
    }
    let removed = 0;
    for (const name of names.filter((entry) =>
      prefixes.some((prefix) => entry.startsWith(prefix)),
    )) {
      if (await this.remove(name)) removed += 1;
    }
    return removed;
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
