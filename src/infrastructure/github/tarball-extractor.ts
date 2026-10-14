import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { extract as tarExtract, ReadEntry } from 'tar';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { isFileSystemFailure, snapshotWriteFailed } from './snapshot-errors.js';

export interface ExtractionLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export interface ExtractionResult {
  /** Symbolic and hard link entries that were skipped (RF-127). */
  readonly skippedLinks: number;
}

/** RF-127 defaults: 100,000 entries and 500 MB. */
export const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = {
  maxEntries: 100_000,
  maxBytes: 500 * 1024 * 1024,
};

const FILE_TYPES: ReadonlySet<string> = new Set(['File', 'OldFile', 'ContiguousFile']);
const LINK_TYPES: ReadonlySet<string> = new Set(['Link', 'SymbolicLink']);

/** Windows device names, with or without an extension, a trailing dot or space, or a stream (`CON:x`). */
const DEVICE_NAME = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i;

function isDeviceName(segment: string): boolean {
  const base = segment.split(/[.:]/)[0] ?? '';
  return DEVICE_NAME.test(base.trimEnd());
}

/**
 * An absolute path (POSIX or Windows), any `..` segment, a drive letter at the start of any segment, or a
 * Windows device name below the stripped top folder, on either separator (RF-122, ADR-019).
 */
function isUnsafePath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\')) return true;
  const segments = path.split(/[\\/]/);
  return (
    segments.includes('..') ||
    segments.some((segment) => /^[A-Za-z]:/.test(segment)) ||
    segments.slice(1).some(isDeviceName)
  );
}

export function tooLarge(what: 'entries' | 'bytes', limit: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.snapshotTooLarge,
    `The repository archive has more than ${String(limit)} ${what}.`,
  );
}

class EntryGate {
  skippedLinks = 0;
  failure: RosettaError | undefined;
  private entries = 0;
  private bytes = 0;
  private readonly limits: ExtractionLimits;
  private readonly stop: (error: RosettaError) => void;

  constructor(limits: ExtractionLimits, stop: (error: RosettaError) => void) {
    this.limits = limits;
    this.stop = stop;
  }

  /** The `tar` filter: true extracts the entry, false skips it; a refusal also stops the stream. */
  readonly allow = (path: string, entry: unknown): boolean => {
    this.entries += 1;
    if (this.entries > this.limits.maxEntries)
      return this.refuse(tooLarge('entries', this.limits.maxEntries));
    if (!(entry instanceof ReadEntry)) return false;
    if (isUnsafePath(path)) {
      return this.refuse(
        new RosettaError(
          ERROR_CODES.snapshotEntryRefused,
          `The archive entry ${JSON.stringify(path)} would land outside the snapshot folder.`,
        ),
      );
    }
    if (LINK_TYPES.has(entry.type)) {
      this.skippedLinks += 1;
      return false;
    }
    if (entry.type === 'Directory') return true;
    if (!FILE_TYPES.has(entry.type)) return false;
    this.bytes += entry.size;
    return this.bytes > this.limits.maxBytes
      ? this.refuse(tooLarge('bytes', this.limits.maxBytes))
      : true;
  };

  private refuse(error: RosettaError): false {
    this.failure ??= error;
    this.stop(error);
    return false;
  }
}

/**
 * Streams a gzipped tarball into `targetDir` with the filter of ADR-019: no absolute paths, no `..`,
 * links skipped and counted, entry and byte limits; the top-level folder GitHub adds is stripped.
 * On any failure the caller deletes `targetDir`.
 */
// RF-122, RF-127
export async function extractTarball(
  body: ReadableStream<Uint8Array>,
  targetDir: string,
  limits: ExtractionLimits,
  signal: AbortSignal,
): Promise<ExtractionResult> {
  const source = Readable.fromWeb(body);
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
      source.on('error', reject);
      gunzip.on('error', reject);
      unpack.on('error', reject);
      unpack.on('end', resolve);
      source.pipe(gunzip).pipe(unpack);
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
