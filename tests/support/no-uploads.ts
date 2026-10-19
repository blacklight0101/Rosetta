import type { UploadStore } from '../../src/application/ports/upload-store.js';

// RF-128: an upload store that holds no snapshot, for the tests of a scan that reads GitHub sources.
export const noUploads: Pick<UploadStore, 'read'> = { read: () => Promise.resolve(undefined) };
