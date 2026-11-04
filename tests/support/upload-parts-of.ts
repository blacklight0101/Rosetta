import type { GitHubRefCheck } from '../../src/application/ports/github-ref-check.js';
import type { UploadStore } from '../../src/application/ports/upload-store.js';
import type { WorkbookStaging } from '../../src/application/ports/workbook-staging.js';
import { FakeUploadStore } from './fake-upload-store.js';
import { FakeWorkbookStaging } from './fake-workbook-staging.js';
import type { UploadParts } from './project-services.js';

const DEFAULT_TEST_UPLOAD_MB = 5;
const BYTES_PER_MB = 1024 * 1024;

/** RF-128, RF-129: the store uploads go to (a fake by default) and the limit it is given. */
export function uploadPartsOf(options: {
  readonly uploads?: UploadStore;
  readonly uploadMaxMb?: number;
  readonly workbookStaging?: WorkbookStaging;
  readonly refCheck?: GitHubRefCheck;
}): UploadParts {
  const { uploads = new FakeUploadStore(), uploadMaxMb = DEFAULT_TEST_UPLOAD_MB } = options;
  const { workbookStaging = new FakeWorkbookStaging() } = options;
  const limitBytes = uploadMaxMb * BYTES_PER_MB;
  const { refCheck } = options;
  return {
    ...{ store: uploads, staging: workbookStaging, limitBytes },
    ...(refCheck === undefined ? {} : { refCheck }),
  };
}
