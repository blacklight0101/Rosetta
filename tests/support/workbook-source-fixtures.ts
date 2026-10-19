// RF-152, RFC-005 section 4.1: records of the workbook source kind, for the tests that read, write
// and refuse them. Generated test data only.

export const WORKBOOK_HASH = `sha256:${'a'.repeat(64)}`;
export const FILE_HASH = `sha256:${'b'.repeat(64)}`;
export const PROJECT_ID = '00000000-0000-4000-a000-000000000001';
export const WORKBOOK_KEY = `workbook__${PROJECT_ID}@0123456789abcdef`;
export const UPLOAD_KEY = `upload__${PROJECT_ID}@0123456789abcdef`;

export const workbookEntry = {
  fileName: 'Pricing.xlsx',
  folder: 'Pricing.xlsx',
  sizeBytes: 20480,
  sha256: FILE_HASH,
  counts: { sheets: 3, nonEmptyCells: 1200, formulas: 340, macroModules: 2, macrosSkipped: 1 },
} as const;

export const workbookRecord = {
  schemaVersion: 1,
  kind: 'workbook',
  uploadedAt: '2026-10-19T08:00:00.000Z',
  rendererVersion: '1',
  workbooks: [workbookEntry],
  fileCount: 9,
  totalBytes: 5120,
  skippedLinks: 0,
  snapshotHash: WORKBOOK_HASH,
} as const;

export const uploadRecord = {
  schemaVersion: 1,
  kind: 'upload',
  fileName: 'OrderDesk.zip',
  uploadedAt: '2026-10-19T08:00:00.000Z',
  fileCount: 12,
  totalBytes: 3456,
  skippedLinks: 2,
  snapshotHash: WORKBOOK_HASH,
} as const;

export const githubFields = {
  url: 'https://github.com/Octo/Demo',
  owner: 'Octo',
  repo: 'Demo',
  commitSha: 'ab'.repeat(20),
  resolvedFrom: 'main',
  downloadedAt: '2026-10-11T09:05:03.007Z',
  licence: 'MIT',
} as const;
