import type { ReportModel } from '../../src/application/report/report-model.js';

// RF-131: the source of a run on an uploaded zip, as the report model and the header show it.

export const uploadHash = `sha256:${'ab'.repeat(32)}`;

export const uploadReportSource = {
  kind: 'upload',
  fileName: 'OrderDesk.zip',
  uploadedAt: '2026-10-19T09:30:00.000Z',
  snapshotHash: uploadHash,
} as const satisfies NonNullable<ReportModel['source']>;

/** A file name that would be markup, a link or a table cell if it were not shown as text. */
export const hostileFileName =
  '<img src=x onerror=alert(1)> **b** [x](javascript:alert(1)) | y.zip';

/** An address on github.com, wherever it stands in a page or a document. */
export const githubAddress = /https?:\/\/[^\s"')]*github\.com/u;
