import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  PublishedWorkbooks,
  PublishRequest,
  ReceiveRequest,
  StagedFile,
  WorkbookProgress,
  WorkbookStaging,
} from '../../application/ports/workbook-staging.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { snapshotWriteFailed } from '../github/snapshot-errors.js';
import { SnapshotStore } from '../github/snapshot-store.js';
import type { Release, SpaceReservation } from './space-reservation.js';
import { receiveZip, uploadTimedOut, uploadTooLarge, type IntakeFormat } from './upload-intake.js';
import { refusingFile } from './workbook/file-refusal.js';
import { checkWorkbookBatch } from './workbook/workbook-batch.js';
import { workbookNotReadable } from './workbook/workbook-errors.js';
import { checkFileName } from './workbook/workbook-format.js';
import { DEFAULT_WORKBOOK_LIMITS, type WorkbookLimits } from './workbook/workbook-limits.js';
import { publishWorkbooks } from './workbook/workbook-publish.js';
import type { UploadedWorkbook } from './workbook/workbook-tree.js';

// RF-150, RF-151, RF-152, RFC-005 section 4.2: the staging area of a workbook batch over the data
// folder. A batch is a `.partial-batch-<id>` folder under `<data>/sources/`, so the start-up sweep of
// partial folders deletes one a restart left behind. Each file streams into it as a `.part` file that
// becomes the file only when it arrived whole; the folder holds the room of twice the limit from the
// opening to the end of the batch (DEC-149).

export interface DiskWorkbookStagingOptions {
  readonly dataDir: string;
  /** The reservation of free space the zip uploads share. */
  readonly reservation: SpaceReservation;
  readonly limits?: Partial<WorkbookLimits>;
  /** How long the body may stay silent. */
  readonly stallMs?: number;
  /** How long reading and rendering a batch may take. */
  readonly publishTimeoutMs?: number;
}

/** What a batch holds while it is open. */
interface OpenBatch {
  readonly dir: string;
  readonly release: Release;
  readonly files: UploadedWorkbook[];
  /** Numbers the files, also the ones that failed, so no two share a path. */
  sequence: number;
}

const PARTIAL_BATCH_PREFIX = '.partial-batch-';
const DEFAULT_STALL_MS = 60_000;
const DEFAULT_PUBLISH_TIMEOUT_MS = 5 * 60_000;
/** How the time-bound message names each step (RF-159). */
const STEP_NAMES = {
  reading: 'reading',
  rendering: 'rendering',
  dependencies: 'dependency map',
  saving: 'saving',
} as const satisfies Record<WorkbookProgress['step'], string>;
/** DEC-149: a batch needs its files and the rendered tree, so twice the limit must be free. */
const FREE_SPACE_FACTOR = 2;

/** A package, or the compound file of an old or protected workbook, which the reader names (RF-151). */
const WORKBOOK_FORMAT = (fileName: string): IntakeFormat => ({
  signatures: [
    [0x50, 0x4b, 0x03, 0x04],
    [0xd0, 0xcf, 0x11, 0xe0],
  ],
  what: 'a workbook',
  notReadable: (detail) => workbookNotReadable(fileName, detail),
});

export class DiskWorkbookStaging implements WorkbookStaging {
  private readonly options: DiskWorkbookStagingOptions;
  private readonly snapshots: SnapshotStore;
  private readonly limits: WorkbookLimits;
  private readonly batches = new Map<string, OpenBatch>();

  constructor(options: DiskWorkbookStagingOptions) {
    this.options = options;
    this.snapshots = new SnapshotStore(options.dataDir);
    this.limits = { ...DEFAULT_WORKBOOK_LIMITS, ...options.limits };
  }

  async open(limitBytes: number): Promise<string> {
    const release = await this.options.reservation.reserve(limitBytes * FREE_SPACE_FACTOR);
    const id = randomUUID();
    const dir = join(this.snapshots.sourcesDir, `${PARTIAL_BATCH_PREFIX}${id}`);
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      release();
      throw snapshotWriteFailed('folder could not be created', error);
    }
    this.batches.set(id, { dir, release, files: [], sequence: 0 });
    return id;
  }

  async receive(id: string, request: ReceiveRequest): Promise<StagedFile> {
    const batch = this.batches.get(id) ?? this.missing();
    const { fileName } = request;
    // The name and the count are judged before a byte of the body is read.
    await refusingFile(fileName, () => {
      checkFileName(fileName);
      checkWorkbookBatch(
        [...batch.files.map((file) => file.fileName), fileName],
        this.limits.maxFiles,
      );
    });
    if (request.declaredBytes !== undefined && request.declaredBytes > request.limitBytes) {
      throw uploadTooLarge(request.limitBytes);
    }
    batch.sequence += 1;
    const path = join(batch.dir, `${String(batch.sequence)}.xlsx`);
    const size = await refusingFile(fileName, () => this.stream(request, `${path}.part`));
    try {
      await rename(`${path}.part`, path);
    } catch (error) {
      await rm(`${path}.part`, { force: true });
      throw snapshotWriteFailed('upload could not be stored', error);
    }
    batch.files.push({ fileName, path, size });
    return { name: fileName, size };
  }

  async publish(id: string, request: PublishRequest): Promise<PublishedWorkbooks> {
    const batch = this.batches.get(id) ?? this.missing();
    const bound = AbortSignal.timeout(this.options.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS);
    // The step the work is in, so the time bound names what took too long.
    let step: WorkbookProgress['step'] = 'reading';
    const onProgress = (progress: WorkbookProgress): void => {
      step = progress.step;
      request.onProgress?.(progress);
    };
    const check = (): void => {
      if (request.signal.aborted) {
        throw request.signal.reason instanceof Error ? request.signal.reason : new Error('stopped');
      }
      if (bound.aborted) throw uploadTimedOut(STEP_NAMES[step]);
    };
    try {
      return await publishWorkbooks(this.snapshots, {
        uploads: batch.files,
        ...{ projectId: request.projectId, uploadedAt: request.uploadedAt, check },
        onProgress,
        limits: this.limits,
        signal: AbortSignal.any([request.signal, bound]),
      });
    } finally {
      await this.discard(id);
    }
  }

  async discard(id: string): Promise<void> {
    const batch = this.batches.get(id);
    if (batch === undefined) return;
    this.batches.delete(id);
    try {
      await rm(batch.dir, { recursive: true, force: true });
    } finally {
      batch.release();
    }
  }

  /** The body to a `.part` file; whatever fails leaves no file. */
  private async stream(request: ReceiveRequest, partPath: string): Promise<number> {
    try {
      return await receiveZip(
        {
          body: request.body,
          limitBytes: request.limitBytes,
          stallMs: this.options.stallMs ?? DEFAULT_STALL_MS,
          signal: request.signal,
          format: WORKBOOK_FORMAT(request.fileName),
        },
        partPath,
      );
    } catch (error) {
      await rm(partPath, { force: true });
      throw error;
    }
  }

  private missing(): never {
    throw new RosettaError(ERROR_CODES.notFound);
  }
}
