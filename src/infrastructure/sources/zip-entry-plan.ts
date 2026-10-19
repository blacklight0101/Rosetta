import type { Entry, ZipFile } from 'yauzl';
import {
  hasUnwritableSegment,
  isInLeftOutFolder,
  isUnsafePath,
  LimitCounter,
  splitPath,
} from './entry-guards.js';
import {
  zipArchiveRatioTooHigh,
  zipEmpty,
  zipEntryPathUnsafe,
  zipEntryUnsupported,
  zipRatioTooHigh,
  zipTooLarge,
  zipTooManyEntries,
} from './zip-errors.js';
import {
  RATIO_ARCHIVE_FLOOR_BYTES,
  RATIO_ENTRY_FLOOR_BYTES,
  type ZipExtractionLimits,
} from './zip-limits.js';

// RF-129, RF-130: what the central directory says, judged before a byte is written. The central
// directory is the authoritative list of entries, so a crafted local header cannot smuggle one past.

/** A file that will be written, with its path below the destination. */
export interface PlannedFile {
  readonly entry: Entry;
  readonly segments: readonly string[];
}

export interface ZipPlan {
  readonly files: readonly PlannedFile[];
  readonly skippedLinks: number;
  readonly skippedDeviceNames: number;
  readonly leftOutEntries: number;
}

const STORED = 0;
const DEFLATED = 8;
const UTF8_NAME_FLAG = 0x800;
/** Host systems whose external attributes hold Unix mode bits: Unix and macOS. */
const UNIX_HOSTS: ReadonlySet<number> = new Set([3, 19]);
const MODE_TYPE_MASK = 0o170000;
const MODE_SYMLINK = 0o120000;
const BITS_PER_BYTE = 8;
const MODE_SHIFT = 16;

function nameOf(entry: Entry): string {
  const utf8 = (entry.generalPurposeBitFlag & UTF8_NAME_FLAG) !== 0;
  return entry.fileNameRaw.toString(utf8 ? 'utf8' : 'latin1');
}

function isLink(entry: Entry): boolean {
  return (
    UNIX_HOSTS.has(entry.versionMadeBy >> BITS_PER_BYTE) &&
    ((entry.externalFileAttributes >>> MODE_SHIFT) & MODE_TYPE_MASK) === MODE_SYMLINK
  );
}

function checkReadable(entry: Entry, name: string): void {
  if (entry.isEncrypted()) throw zipEntryUnsupported(name, 'is encrypted');
  if (entry.compressionMethod !== STORED && entry.compressionMethod !== DEFLATED) {
    const method = String(entry.compressionMethod);
    throw zipEntryUnsupported(name, `uses the unsupported compression method ${method}`);
  }
}

/** The first segment when every file sits in one folder (RF-130); a file at the top blocks it. */
function commonTopFolder(files: readonly PlannedFile[]): string | undefined {
  const first = files[0]?.segments[0];
  const shared = files.every((file) => file.segments.length > 1 && file.segments[0] === first);
  return shared ? first : undefined;
}

class PlanBuilder {
  skippedLinks = 0;
  leftOutEntries = 0;
  private keptUncompressed = 0;
  private keptCompressed = 0;
  readonly candidates: PlannedFile[] = [];
  private readonly limits: ZipExtractionLimits;

  constructor(limits: ZipExtractionLimits) {
    this.limits = limits;
  }

  add(entry: Entry): void {
    const name = nameOf(entry);
    if (isUnsafePath(name)) throw zipEntryPathUnsafe(name);
    // Folders are made from file paths only, so a directory entry needs nothing more.
    if (/[\\/]$/.test(name)) return;
    checkReadable(entry, name);
    const segments = splitPath(name).filter((part) => part !== '' && part !== '.');
    if (isLink(entry)) {
      this.skippedLinks += 1;
    } else if (isInLeftOutFolder(segments)) {
      this.leftOutEntries += 1;
    } else {
      if (
        entry.uncompressedSize > RATIO_ENTRY_FLOOR_BYTES &&
        entry.uncompressedSize > this.limits.maxRatio * entry.compressedSize
      ) {
        throw zipRatioTooHigh(name, this.limits.maxRatio);
      }
      this.keptUncompressed += entry.uncompressedSize;
      this.keptCompressed += entry.compressedSize;
      this.candidates.push({ entry, segments });
    }
  }

  /** The overall ratio of the files that will be written, judged once the archive is large (DEC-151). */
  private checkArchiveRatio(): void {
    const { maxRatio } = this.limits;
    if (
      this.keptUncompressed > RATIO_ARCHIVE_FLOOR_BYTES &&
      this.keptUncompressed > maxRatio * this.keptCompressed
    ) {
      throw zipArchiveRatioTooHigh(maxRatio);
    }
  }

  build(): ZipPlan {
    this.checkArchiveRatio();
    const top = commonTopFolder(this.candidates);
    const files: PlannedFile[] = [];
    let skippedDeviceNames = 0;
    for (const { entry, segments } of this.candidates) {
      // The stripped folder is not judged: `aux/` as the only top folder is kept.
      const below = top === undefined ? segments : segments.slice(1);
      if (hasUnwritableSegment(below)) skippedDeviceNames += 1;
      else files.push({ entry, segments: below });
    }
    if (files.length === 0) throw zipEmpty();
    return {
      files,
      skippedLinks: this.skippedLinks,
      skippedDeviceNames,
      leftOutEntries: this.leftOutEntries,
    };
  }
}

/** Reads the central directory, enforces the limits that need no content, and lists the files to write. */
export async function planExtraction(zip: ZipFile, limits: ZipExtractionLimits): Promise<ZipPlan> {
  if (zip.entryCount > limits.maxEntries) throw zipTooManyEntries(limits.maxEntries);
  const declared = new LimitCounter(limits.maxBytes);
  const plan = new PlanBuilder(limits);
  for await (const entry of zip.eachEntry()) {
    // Every entry counts, the ones that are skipped or left out included (as RF-127 counts them).
    if (!declared.add(entry.uncompressedSize)) throw zipTooLarge(limits.maxBytes);
    plan.add(entry);
  }
  return plan.build();
}
