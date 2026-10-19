import { Readable, Transform, type TransformCallback } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { extract as tarExtract, ReadEntry } from 'tar';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  hasUnwritableSegment,
  isUnsafePath,
  LimitCounter,
  splitPath,
} from '../sources/entry-guards.js';
import { isFileSystemFailure, snapshotWriteFailed } from './snapshot-errors.js';

export interface ExtractionLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export interface ExtractionResult {
  /** Link entries and entries with a name Windows cannot write that were skipped (RF-122, RF-127). */
  readonly skippedLinks: number;
}

/** RF-127 defaults: 100,000 entries and 500 MB. */
export const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = {
  maxEntries: 100_000,
  maxBytes: 500 * 1024 * 1024,
};

const FILE_TYPES: ReadonlySet<string> = new Set(['File', 'OldFile', 'ContiguousFile']);
const LINK_TYPES: ReadonlySet<string> = new Set(['Link', 'SymbolicLink']);

export function tooLarge(what: 'entries' | 'bytes', limit: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.snapshotTooLarge,
    `The repository archive has more than ${String(limit)} ${what}.`,
  );
}

class EntryGate {
  skippedLinks = 0;
  failure: RosettaError | undefined;
  private readonly entries: LimitCounter;
  private readonly bytes: LimitCounter;
  private readonly streamBytes: LimitCounter;
  private readonly limits: ExtractionLimits;
  private readonly stop: (error: RosettaError) => void;

  constructor(limits: ExtractionLimits, stop: (error: RosettaError) => void) {
    this.limits = limits;
    this.entries = new LimitCounter(limits.maxEntries);
    this.bytes = new LimitCounter(limits.maxBytes);
    this.streamBytes = new LimitCounter(limits.maxBytes);
    this.stop = stop;
  }

  /** The `tar` filter: true extracts the entry, false skips it; a refusal also stops the stream. */
  readonly allow = (path: string, entry: unknown): boolean => {
    if (!this.entries.add()) return this.refuse(tooLarge('entries', this.limits.maxEntries));
    if (!(entry instanceof ReadEntry)) return false;
    if (isUnsafePath(path)) {
      return this.refuse(
        new RosettaError(
          ERROR_CODES.snapshotEntryRefused,
          `The archive entry ${JSON.stringify(path)} would land outside the snapshot folder.`,
        ),
      );
    }
    // P1-160: every entry's declared body counts, skipped ones included, before it arrives.
    if (!this.bytes.add(entry.size)) return this.refuse(tooLarge('bytes', this.limits.maxBytes));
    // The top folder is stripped, so only the names below it are judged.
    if (LINK_TYPES.has(entry.type) || hasUnwritableSegment(splitPath(path).slice(1))) {
      this.skippedLinks += 1;
      return false;
    }
    return entry.type === 'Directory' || FILE_TYPES.has(entry.type);
  };

  /**
   * P1-160: counts the decompressed stream (headers, metadata, skipped bodies and anything after
   * the end of the archive); false once it passes the byte limit, so no byte past it is parsed.
   */
  readonly allowBytes = (count: number): boolean => {
    if (this.failure !== undefined) return false;
    return this.streamBytes.add(count)
      ? true
      : this.refuse(tooLarge('bytes', this.limits.maxBytes));
  };

  private refuse(error: RosettaError): false {
    this.failure ??= error;
    this.stop(error);
    return false;
  }
}

/** Passes the decompressed bytes on while the gate allows them, and drops the rest. */
function byteCounter(gate: EntryGate): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
      if (gate.allowBytes(chunk.length)) done(null, chunk);
      else done();
    },
  });
}

/**
 * The chunks of a web stream, one by one. A stream that ends early (the source was destroyed) is
 * cancelled. Written by hand because `Readable.fromWeb` takes Node's own stream type, which clashes
 * with the DOM one that Preact's typings bring into the build (P3-01).
 */
async function* chunksOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        return;
      }
      yield value;
    }
  } finally {
    if (!finished) await reader.cancel();
    reader.releaseLock();
  }
}

/**
 * Streams a gzipped tarball into `targetDir` with the filter of ADR-019: no absolute paths, no `..`,
 * links skipped and counted, entry and byte limits (the byte limit counts the decompressed stream
 * as well as the declared entry sizes); the top-level folder GitHub adds is stripped.
 * On any failure the caller deletes `targetDir`.
 */
// RF-122, RF-127
export async function extractTarball(
  body: ReadableStream<Uint8Array>,
  targetDir: string,
  limits: ExtractionLimits,
  signal: AbortSignal,
): Promise<ExtractionResult> {
  const source = Readable.from(chunksOf(body));
  const gate = new EntryGate(limits, (error) => source.destroy(error));
  const unpack = tarExtract({
    cwd: targetDir,
    strip: 1,
    strict: true,
    preservePaths: false,
    noChmod: true,
    filter: gate.allow,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const gunzip = createGunzip();
      const counter = byteCounter(gate);
      source.on('error', reject);
      gunzip.on('error', reject);
      counter.on('error', reject);
      unpack.on('error', reject);
      unpack.on('end', resolve);
      source.pipe(gunzip).pipe(counter).pipe(unpack);
    });
  } catch (error) {
    if (gate.failure !== undefined) throw gate.failure;
    if (signal.aborted) throw error;
    if (isFileSystemFailure(error)) throw snapshotWriteFailed('could not be extracted', error);
    throw new RosettaError(
      ERROR_CODES.githubRequestFailed,
      'The repository archive could not be read to its end.',
      { cause: error },
    );
  }
  if (gate.failure !== undefined) throw gate.failure;
  return { skippedLinks: gate.skippedLinks };
}
