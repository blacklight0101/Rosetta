import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { sourcesEntries, storeIn } from '../../../support/upload-store-harness.js';
import { createUploadProject } from '../../../support/upload-route-harness.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';
import { sampleBook } from '../../../support/workbook-staging-harness.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';
import { buildRawNameZip } from '../../../support/zip-fixtures.js';

// RF-129, RF-159, ADR-022, DEC-188: a zip whose workbook would land outside its folder is refused
// inside the request, before it is accepted: the answer is a 400, no batch is started and nothing
// is stored. The real store and extractor decide it.

const root = useWritableTempRoot('rosetta-upload-hostile-');
const open: TestServer[] = [];
afterEach(async () => {
  for (const test of open.splice(0)) await test.server.close();
});

describe('PUT /api/projects/:id/source with an unsafe workbook path in the zip', () => {
  it('RF-129 answers 400 at once for ../x.xlsx, with no batch and no snapshot', async () => {
    const test = createTestServer({ uploads: storeIn(root.path) });
    open.push(test);
    const amy = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));
    const id = await createUploadProject(amy);
    const zip = await buildRawNameZip([
      { name: 'src/a.cs', data: 'class A {}' },
      { name: '../x.xlsx', data: await sampleBook() },
    ]);

    const answer = await amy.request({
      method: 'PUT',
      url: `/api/projects/${id}/source`,
      payload: zip,
      headers: { 'content-type': 'application/zip' },
    });
    const current = await amy.request({
      method: 'GET',
      url: `/api/projects/${id}/source/batches/current`,
    });

    expect(answer.statusCode).toBe(400);
    expect(answer.json()).toMatchObject({ code: ERROR_CODES.zipEntryPathUnsafe });
    expect(current.statusCode).toBe(404);
    expect(await sourcesEntries(root.path)).toEqual([]);
  });
});
