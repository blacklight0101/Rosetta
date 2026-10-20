import { mkdir, statfs } from 'node:fs/promises';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { snapshotWriteFailed } from '../github/snapshot-errors.js';

// DEC-149, RF-129: the free space the uploads under the data folder may still count on. Every upload
// that writes there (a zip, a batch of workbooks) holds back what it may need from the moment it
// starts to the moment it ends, and each check counts what the others hold, so uploads that start
// together cannot each pass against the same free bytes.

export interface SpaceReservationOptions {
  readonly dataDir: string;
  /** Free bytes of the data folder; the file system's by default. */
  readonly freeBytes?: () => Promise<number>;
}

/** Gives the held bytes back; calling it again does nothing. */
export type Release = () => void;

/** RST-1917: the data folder cannot hold the upload. */
function noSpace(requiredBytes: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.uploadNoSpace,
    `The data folder has less than ${String(requiredBytes)} bytes free.`,
  );
}

export class SpaceReservation {
  private readonly options: SpaceReservationOptions;
  /** Free bytes the uploads running now may still need, held back from the next check. */
  private reservedBytes = 0;

  constructor(options: SpaceReservationOptions) {
    this.options = options;
  }

  /**
   * Checks the free space against what the uploads already running hold back, then holds back this
   * one's share. Nothing awaits between the check and the hold; the caller releases the share.
   */
  async reserve(requiredBytes: number): Promise<Release> {
    const free = await (this.options.freeBytes ?? this.fileSystemFreeBytes.bind(this))();
    if (free - this.reservedBytes < requiredBytes) throw noSpace(requiredBytes);
    this.reservedBytes += requiredBytes;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reservedBytes -= requiredBytes;
    };
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
}
