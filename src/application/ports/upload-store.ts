import type { SentSnapshot, UploadSnapshotInfo } from './source-fetcher.js';
import type { LeftOut, WorkbookSummaryLine } from './workbook-staging.js';

// RF-128, RF-129, RF-130, RFC-004 section 4.2: where an uploaded zip becomes a snapshot. The store
// streams the body to a temporary file under a size limit, unpacks it (the ZipExtractor port),
// hashes the tree, writes `snapshot.json` and deletes the zip, all in a folder of its own that is
// renamed into place at the end. A failure or an abort leaves no folder behind. Failures are
// RosettaErrors in the RST-19xx range.

export interface UploadRequest {
  readonly projectId: string;
  /** The recorded name, with its `.zip`. */
  readonly fileName: string;
  /** ISO 8601 instant in UTC, from the Clock. */
  readonly uploadedAt: string;
  /** The raw request body. */
  readonly body: AsyncIterable<Uint8Array>;
  /** The `Content-Length` the client declared, when it sent one. */
  readonly declaredBytes: number | undefined;
  /** The largest archive accepted (`ROSETTA_UPLOAD_MAX_MB`). */
  readonly limitBytes: number;
  /** Aborted when the request is aborted or the server shuts down. */
  readonly signal: AbortSignal;
}

export interface StoredUpload {
  /** The folder name under `<data>/sources/`. */
  readonly key: string;
  readonly info: UploadSnapshotInfo;
  /** Bytes of the zip as received. */
  readonly zipBytes: number;
  /** Entries left out: links, unwritable names, `.git`, `node_modules`, `bin`, `obj`. */
  readonly skipped: number;
  /**
   * RF-152, Q-41: the workbooks of the zip that were rendered and the ones left out with their
   * reasons. Absent when the zip held no workbook, so a zip without one reads as it always did.
   */
  readonly workbooks?: readonly WorkbookSummaryLine[] | undefined;
  readonly leftOut?: readonly LeftOut[] | undefined;
}

export interface UploadStore {
  store(request: UploadRequest): Promise<StoredUpload>;
  /** The snapshot of an upload or workbook key; undefined when there is none. */
  read(key: string): Promise<SentSnapshot | undefined>;
  /** Deletes one snapshot; false when there is none. */
  remove(key: string): Promise<boolean>;
  /** Deletes every snapshot of the project's uploads and workbooks; how many went. */
  removeAllOf(projectId: string): Promise<number>;
}
