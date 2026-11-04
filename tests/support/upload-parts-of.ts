import type { TestServerOptions } from './web-server.js';
import { FakeUploadStore } from './fake-upload-store.js';
import { FakeWorkbookStaging } from './fake-workbook-staging.js';
import type { UploadParts } from './project-services.js';

const DEFAULT_TEST_UPLOAD_MB = 5;
const BYTES_PER_MB = 1024 * 1024;

/** RF-128, RF-129: the store uploads go to (a fake by default) and the limit it is given. */
export function uploadPartsOf(options: TestServerOptions): UploadParts {
  const { uploads = new FakeUploadStore(), uploadMaxMb = DEFAULT_TEST_UPLOAD_MB } = options;
  const { workbookStaging = new FakeWorkbookStaging() } = options;
  const limitBytes = uploadMaxMb * BYTES_PER_MB;
  const { refCheck } = options;
  return {
    ...{ store: uploads, staging: workbookStaging, limitBytes },
    ...(refCheck === undefined ? {} : { refCheck }),
  };
}
