import type { WorkbookSnapshotInfo } from './source-fetcher.js';

// RF-150, RF-151, RF-152, RFC-005 section 4.2: where the files of a workbook batch are kept while the
// batch is open, and how a finished batch becomes a snapshot. A batch is a staging folder under the
// data folder: each file streams into it under the part of the total limit that is still free, and
// the finish reads, renders and publishes every workbook or none, then deletes the workbooks and the
// folder. A failed file leaves no partial file behind; a refused workbook is a FieldProblemsError that
// names the file. Failures are RosettaErrors in the RST-19xx range.

/** A workbook that is in the staging folder. */
export interface StagedFile {
  /** The name it was recorded under, with its extension. */
  readonly name: string;
  readonly size: number;
}

export interface ReceiveRequest {
  /** The name as recorded: decoded, a base name, at most 200 characters. */
  readonly fileName: string;
  /** The raw request body. */
  readonly body: AsyncIterable<Uint8Array>;
  /** The `Content-Length` the client declared, when it sent one. */
  readonly declaredBytes: number | undefined;
  /** What the batch may still take: `ROSETTA_UPLOAD_MAX_MB` less what it holds. */
  readonly limitBytes: number;
  /** Aborted when the request is aborted or the server shuts down. */
  readonly signal: AbortSignal;
}

/** RF-159: the step the server is in while a batch is processed. */
export type WorkbookStep = 'reading' | 'rendering' | 'dependencies' | 'saving';

/**
 * RF-159, DEC-183: where processing has got to. `workbook` and `sheet` count from 1 (0 before the
 * first is known); `cells` are the non-empty cells read so far.
 */
export interface WorkbookProgress {
  readonly step: WorkbookStep;
  readonly workbook: number;
  readonly workbooks: number;
  readonly sheet: number;
  readonly sheets: number;
  readonly cells: number;
}

export type ProgressListener = (progress: WorkbookProgress) => void;

export interface PublishRequest {
  readonly projectId: string;
  /** ISO 8601 instant in UTC, from the Clock. */
  readonly uploadedAt: string;
  readonly signal: AbortSignal;
  /** Told where processing has got to (RF-159); it must not throw. */
  readonly onProgress?: ProgressListener;
}

/** What one workbook counted for the page (RF-150). */
export interface WorkbookSummaryLine {
  readonly name: string;
  readonly sheets: number;
  /** Non-empty cells. */
  readonly cells: number;
  readonly formulas: number;
  readonly macroModules: number;
}

/** An item that was left out of a source, and why (RF-150, Q-41). */
export interface LeftOut {
  readonly name: string;
  readonly reason: string;
}

export interface PublishedWorkbooks {
  /** The folder name under `<data>/sources/`: `workbook__<project id>@<16 hex>`. */
  readonly key: string;
  readonly info: WorkbookSnapshotInfo;
  readonly summary: readonly WorkbookSummaryLine[];
  readonly skipped: readonly LeftOut[];
}

export interface WorkbookStaging {
  /**
   * Holds twice `limitBytes` of free space (DEC-149) for the batch until it ends and makes its staging
   * folder; the id names it. RST-1917 when the space is not there.
   */
  open(limitBytes: number): Promise<string>;
  /** Streams one workbook into the batch. Nothing is left of a file that is refused or fails. */
  receive(id: string, request: ReceiveRequest): Promise<StagedFile>;
  /** Reads, renders and publishes every workbook of the batch or none, and ends the batch. */
  publish(id: string, request: PublishRequest): Promise<PublishedWorkbooks>;
  /** Deletes the staging folder and gives the space back; nothing happens for an unknown batch. */
  discard(id: string): Promise<void>;
}
