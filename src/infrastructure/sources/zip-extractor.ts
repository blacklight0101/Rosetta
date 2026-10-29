import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { openPromise, type ZipFile } from 'yauzl';
import type { ZipExtraction, ZipExtractor } from '../../application/ports/zip-extractor.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { isFileSystemFailure, snapshotWriteFailed } from '../github/snapshot-errors.js';
import { LimitCounter } from './entry-guards.js';
import { isWorkbookName } from './workbook/workbook-extensions.js';
import { planExtraction, type PlannedFile } from './zip-entry-plan.js';
import { zipNotReadable, zipTooLarge } from './zip-errors.js';
import type { ZipExtractionLimits } from './zip-limits.js';

const FILE_MODE = 0o644;

/**
 * Counts what is written, across the whole extraction, and stops at the byte limit whatever the
 * headers declare (RF-129). `bytes` is what this entry produced, for the check against its header.
 */
class WrittenBytes extends Transform {
  bytes = 0;
  private readonly total: LimitCounter;
  private readonly limit: number;

  constructor(total: LimitCounter, limit: number) {
    super();
    this.total = total;
    this.limit = limit;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.total.add(chunk.length)) done(null, chunk);
    else done(zipTooLarge(this.limit));
  }
}

/** The error to throw for whatever stopped the extraction. */
function failureOf(error: unknown, signal: AbortSignal): unknown {
  if (error instanceof RosettaError || signal.aborted) return error;
  if (isFileSystemFailure(error)) return snapshotWriteFailed('could not be extracted', error);
  return zipNotReadable('it is damaged or not a zip', error);
}

/**
 * Reads a zip with `yauzl` (ADR-022): the central directory is judged first (entry count, declared
 * sizes, paths, encryption, methods, ratio), then each file is streamed to disk under a running
 * byte count. Symbolic links are never created. On any failure the destination is deleted.
 */
// RF-129, RF-130
export class YauzlZipExtractor implements ZipExtractor {
  private readonly limits: ZipExtractionLimits;

  constructor(limits: ZipExtractionLimits) {
    this.limits = limits;
  }

  private async writeFiles(
    zip: ZipFile,
    files: readonly PlannedFile[],
    targetDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    const total = new LimitCounter(this.limits.maxBytes);
    for (const { entry, segments } of files) {
      const path = join(targetDir, ...segments);
      await mkdir(dirname(path), { recursive: true });
      const written = new WrittenBytes(total, this.limits.maxBytes);
      await pipeline(
        await zip.openReadStreamPromise(entry),
        written,
        createWriteStream(path, { flags: 'wx', mode: FILE_MODE }),
        { signal },
      );
      if (written.bytes !== entry.uncompressedSize) {
        throw zipNotReadable('an entry is not the size its header declares');
      }
    }
  }

  // RF-159, DEC-188
  async holdsWorkbooks(zipPath: string): Promise<boolean> {
    let zip: ZipFile | undefined;
    try {
      zip = await openPromise(zipPath, {
        lazyEntries: true,
        autoClose: false,
        decodeStrings: false,
        validateEntrySizes: false,
      });
      const plan = await planExtraction(zip, this.limits);
      return plan.files.some((file) => isWorkbookName(file.segments.at(-1) ?? ''));
    } catch (error) {
      throw failureOf(error, new AbortController().signal);
    } finally {
      zip?.close();
    }
  }

  async extract(zipPath: string, targetDir: string, signal: AbortSignal): Promise<ZipExtraction> {
    let zip: ZipFile | undefined;
    let created: string | undefined;
    try {
      // The library's own size validation is off: a header that lies about a size ends in our
      // written-byte count (RST-1910) or size check (RST-1909), not in an error of the library.
      zip = await openPromise(zipPath, {
        lazyEntries: true,
        autoClose: false,
        decodeStrings: false,
        validateEntrySizes: false,
      });
      const plan = await planExtraction(zip, this.limits);
      created = (await mkdir(targetDir, { recursive: true })) ?? targetDir;
      await this.writeFiles(zip, plan.files, targetDir, signal);
      return {
        keptFiles: plan.files.length,
        skippedLinks: plan.skippedLinks,
        skippedDeviceNames: plan.skippedDeviceNames,
        leftOutEntries: plan.leftOutEntries,
      };
    } catch (error) {
      if (created !== undefined) await rm(created, { recursive: true, force: true });
      throw failureOf(error, signal);
    } finally {
      zip?.close();
    }
  }
}
