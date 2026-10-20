import type { WorkbookSnapshot } from '../../src/application/ports/source-fetcher.js';
import type { UploadStore } from '../../src/application/ports/upload-store.js';
import type { Project } from '../../src/application/projects/project.js';
import { workbookSnapshotKey } from '../../src/domain/sources/workbook-key.js';
import { fixtureRoot } from './scan-harness.js';

// RF-150, RF-152: a workbook project and the snapshot of its workbooks, for the tests of a run that reads one.

export const WORKBOOK_RUN_HASH = `sha256:${'ef'.repeat(32)}`;
export const WORKBOOKS_UPLOADED_AT = '2026-10-19T08:00:00.000Z';
const WORKBOOK_PROJECT_ID = '00000000-0000-4000-a000-0000000000e1';

export const WORKBOOK_RUN_KEY = workbookSnapshotKey(WORKBOOK_PROJECT_ID, WORKBOOK_RUN_HASH);

/** The workbooks a workbook project holds, for the tests of a start that need a source to exist. */
export const heldWorkbooks = {
  fileName: 'Pricing.xlsx, Rates.xlsm',
  uploadedAt: Date.parse(WORKBOOKS_UPLOADED_AT),
  snapshotKey: WORKBOOK_RUN_KEY,
  workbooks: 2,
};

/** Project fields of a workbook project that holds two workbooks. */
export const workbookProjectFields: Partial<Project> = {
  id: WORKBOOK_PROJECT_ID,
  name: 'Pricing',
  sourceKind: 'workbook',
  sourceUrl: '',
  ref: '',
  subpath: '',
  upload: heldWorkbooks,
};

const counts = { sheets: 2, nonEmptyCells: 30, formulas: 4, macroModules: 0, macrosSkipped: 0 };

function entry(fileName: string) {
  const sha256 = `sha256:${'12'.repeat(32)}`;
  return { fileName, folder: fileName, sizeBytes: 2048, sha256, counts } as const;
}

/** The snapshot a store answers for the key, with the C# fixture repository as its tree. */
function fixtureWorkbookSnapshot(root: string): WorkbookSnapshot {
  return {
    kind: 'workbook',
    uploadedAt: WORKBOOKS_UPLOADED_AT,
    rendererVersion: '1',
    workbooks: [entry('Pricing.xlsx'), entry('Rates.xlsm')],
    fileCount: 20,
    totalBytes: 4096,
    skippedLinks: 0,
    snapshotHash: WORKBOOK_RUN_HASH,
    key: WORKBOOK_RUN_KEY,
    rootDir: root,
    cached: true,
  };
}

/** A store that holds the workbook snapshot only, with the tree at `root`. */
export function workbookSnapshotsAt(root: string): Pick<UploadStore, 'read'> {
  return {
    read: (key) =>
      Promise.resolve(key === WORKBOOK_RUN_KEY ? fixtureWorkbookSnapshot(root) : undefined),
  };
}

/** A store that holds the workbook snapshot only. */
export const fixtureWorkbooks = workbookSnapshotsAt(fixtureRoot('webforms-csharp'));
