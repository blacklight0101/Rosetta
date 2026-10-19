import type { UploadSnapshot } from '../../src/application/ports/source-fetcher.js';
import type { UploadStore } from '../../src/application/ports/upload-store.js';
import type { Project } from '../../src/application/projects/project.js';
import { uploadSnapshotKey } from '../../src/domain/sources/upload-name.js';
import { fixtureRoot } from './scan-harness.js';

// RF-128, RF-130: an upload project and the snapshot of its zip, for the tests of a run that reads one.

export const UPLOAD_HASH = `sha256:${'cd'.repeat(32)}`;
export const UPLOADED_AT = '2026-10-19T08:00:00.000Z';
export const UPLOAD_PROJECT_ID = '00000000-0000-4000-a000-0000000000d1';

export const UPLOAD_KEY = uploadSnapshotKey(UPLOAD_PROJECT_ID, UPLOAD_HASH);

/** Project fields of an upload project that holds a zip. */
export const uploadProjectFields: Partial<Project> = {
  id: UPLOAD_PROJECT_ID,
  name: 'OrderDesk',
  sourceKind: 'upload',
  sourceUrl: '',
  ref: '',
  subpath: '',
  upload: {
    fileName: 'OrderDesk.zip',
    uploadedAt: Date.parse(UPLOADED_AT),
    snapshotKey: UPLOAD_KEY,
  },
};

/** The snapshot an upload store answers for the key, with the C# fixture repository as its tree. */
export function fixtureUploadSnapshot(): UploadSnapshot {
  return {
    kind: 'upload',
    fileName: 'OrderDesk.zip',
    uploadedAt: UPLOADED_AT,
    fileCount: 20,
    totalBytes: 4096,
    skippedLinks: 2,
    snapshotHash: UPLOAD_HASH,
    key: UPLOAD_KEY,
    rootDir: fixtureRoot('webforms-csharp'),
    cached: true,
  };
}

/** An upload store that holds the fixture snapshot only. */
export const fixtureUploads: Pick<UploadStore, 'read'> = {
  read: (key) => Promise.resolve(key === UPLOAD_KEY ? fixtureUploadSnapshot() : undefined),
};
