import type { UploadStore } from '../application/ports/upload-store.js';
import { YauzlZipExtractor } from '../infrastructure/sources/zip-extractor.js';
import { DEFAULT_ZIP_LIMITS } from '../infrastructure/sources/zip-limits.js';
import type { SpaceReservation } from '../infrastructure/sources/space-reservation.js';
import { ZipUploadStore } from '../infrastructure/sources/zip-upload-store.js';

// Architecture section 2 (composition root), RF-128, RF-129: the upload store over the data folder,
// with the zip extractor at the limits of RF-127 and RF-129. The projects, the runs and the history
// each need one; it holds no state, so they do not share an instance.

/** The bytes of the largest zip a user may upload (`ROSETTA_UPLOAD_MAX_MB`). */
export function uploadLimitBytes(uploadMaxMb: number): number {
  return uploadMaxMb * 1024 * 1024;
}

// RF-128, DEC-149: the zip store and the workbook staging area count free space from one reservation.
export function createUploadStore(dataDir: string, reservation?: SpaceReservation): UploadStore {
  return new ZipUploadStore({
    dataDir,
    extractor: new YauzlZipExtractor(DEFAULT_ZIP_LIMITS),
    ...(reservation === undefined ? {} : { reservation }),
  });
}
