import type { StoredUpload } from '../ports/upload-store.js';
import type { LeftOut, WorkbookSummaryLine } from '../ports/workbook-staging.js';
import type { Project } from '../projects/project.js';

// RF-128, RF-150, RF-159: what the page shows after a zip was stored, in the answer of the upload or,
// for a zip that holds workbooks, in the state of its batch.

/** What the page shows after an upload (RF-128). */
export interface UploadSummary {
  readonly files: number;
  readonly size: number;
  readonly skipped: number;
  readonly snapshotHash: string;
  readonly fileName: string;
  readonly uploadedAt: string;
  /** The newest run read another snapshot than the one just stored (false while no run has one). */
  readonly codeChangedSinceLastRun: boolean;
  /** RF-150, Q-41: only when the zip held workbooks; what was rendered, and what was left out. */
  readonly workbooks?: readonly WorkbookSummaryLine[];
  readonly leftOut?: readonly LeftOut[];
}

/** The answer for the page; the workbook fields only when the zip held workbooks (RF-150). */
export function summaryOf(
  stored: StoredUpload,
  project: Project,
  fileName: string,
  uploadedAt: string,
): UploadSummary {
  return {
    files: stored.info.fileCount,
    size: stored.info.totalBytes,
    skipped: stored.skipped,
    snapshotHash: stored.info.snapshotHash,
    fileName,
    uploadedAt,
    codeChangedSinceLastRun:
      project.lastRunSnapshotKey !== undefined && project.lastRunSnapshotKey !== stored.key,
    ...(stored.workbooks === undefined
      ? {}
      : { workbooks: stored.workbooks, leftOut: stored.leftOut ?? [] }),
  };
}
