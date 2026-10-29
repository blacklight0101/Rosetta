import { describe, expect, it } from 'vitest';
import type { WorkbookProgress } from '../../../../src/application/ports/workbook-staging.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  bodyOf,
  createUploadProject,
  put,
  useUploadServers,
} from '../../../support/upload-route-harness.js';

// RF-159, RF-1105, DEC-183: while a zip that holds workbooks is unpacked and rendered, the page reads
// the same progress as for a batch of workbooks, from GET /api/projects/:id/source/progress.

const setup = useUploadServers();
const rendering: WorkbookProgress = {
  ...{ step: 'rendering', workbook: 1, workbooks: 2, sheet: 3, sheets: 5, cells: 400 },
};

describe('GET /api/projects/:id/source/progress', () => {
  it('RF-159 gives the progress of the zip being stored, and 404 before and after', async () => {
    const { amy, uploads } = await setup();
    const id = await createUploadProject(amy);
    const url = `/api/projects/${id}/source/progress`;
    uploads.reports = [rendering];
    let release: () => void = () => undefined;
    uploads.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const before = await amy.request({ method: 'GET', url });
    const storing = put(amy, id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const during = await amy.request({ method: 'GET', url });
    release();
    await storing;
    const after = await amy.request({ method: 'GET', url });

    expect(before.statusCode).toBe(404);
    expect(during.statusCode).toBe(200);
    expect(during.json()).toMatchObject({ progress: rendering });
    expect(Object.keys(bodyOf(during))).toContain('elapsedMs');
    expect(after.statusCode).toBe(404);
  });

  it("RF-1105 answers 404 for the zip of another user's project", async () => {
    const { amy, bob, uploads } = await setup();
    const id = await createUploadProject(amy);
    uploads.reports = [rendering];
    let release: () => void = () => undefined;
    uploads.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const storing = put(amy, id);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const foreign = await bob.request({
      method: 'GET',
      url: `/api/projects/${id}/source/progress`,
    });
    release();
    await storing;

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });
});
