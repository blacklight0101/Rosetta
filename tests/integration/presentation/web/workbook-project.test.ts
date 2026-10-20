import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer } from '../../../support/web-server.js';
import { bodyOf, idOf, useUploadServers } from '../../../support/upload-route-harness.js';

// RF-150, RF-158, RF-156: a project of kind workbook is created like an upload project, the project
// view tells how many workbooks its source holds, and the session tells the page the workbook limit.

const setup = useUploadServers();
const uploadedAt = Date.parse('2026-10-19T08:00:00.000Z');

describe('POST /api/projects with a workbook body', () => {
  it('RF-150 creates a project of kind workbook with no source and answers 201', async () => {
    const { amy } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { sourceKind: 'workbook', name: 'Pricing' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Pricing',
      sourceKind: 'workbook',
      source: null,
      sourceUrl: '',
      ref: '',
      subpath: '',
      codeChangedSinceLastRun: false,
    });
  });

  it.each([
    [{ sourceKind: 'workbook', name: '' }],
    [{ sourceKind: 'workbook' }],
    [{ sourceKind: 'workbook', name: 'x'.repeat(201) }],
    [{ sourceKind: 'workbook', name: 'a', url: 'https://github.com/o/r' }],
  ])('RF-150 the body %j answers 400 RST-2000 and creates nothing', async (payload) => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'POST', url: '/api/projects', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    const list = await amy.request({ method: 'GET', url: '/api/projects' });
    expect(list.json()).toEqual({ projects: [] });
  });
});

describe('the project view of a source with workbooks', () => {
  it('RF-156 tells the number of workbooks of a workbook project', async () => {
    const { amy, amyId, test } = await setup();
    const id = idOf(
      await amy.request({
        method: 'POST',
        url: '/api/projects',
        payload: { sourceKind: 'workbook', name: 'Pricing' },
      }),
    );
    const snapshotKey = `workbook__${id}@0123456789abcdef`;
    await test.projects.attachUpload({
      userId: amyId,
      projectId: id,
      upload: { fileName: 'Pricing.xlsx, Rates.xlsx', uploadedAt, snapshotKey, workbooks: 2 },
      updatedAt: uploadedAt,
    });

    const shown = await amy.request({ method: 'GET', url: `/api/projects/${id}` });

    expect(shown.json()).toMatchObject({
      sourceKind: 'workbook',
      source: {
        fileName: 'Pricing.xlsx, Rates.xlsx',
        uploadedAt: '2026-10-19T08:00:00.000Z',
        workbooks: 2,
      },
      codeChangedSinceLastRun: false,
    });
  });
});

describe('the project view of a zip with workbooks', () => {
  it('RF-150 tells the number of workbooks a zip held, and nothing for a zip with none', async () => {
    const { amy, amyId, test } = await setup();
    const withBooks = idOf(
      await amy.request({
        method: 'POST',
        url: '/api/projects',
        payload: { sourceKind: 'upload', name: 'WithBooks' },
      }),
    );
    const without = idOf(
      await amy.request({
        method: 'POST',
        url: '/api/projects',
        payload: { sourceKind: 'upload', name: 'Plain' },
      }),
    );
    for (const [projectId, workbooks] of [
      [withBooks, 3],
      [without, undefined],
    ] as const) {
      await test.projects.attachUpload({
        userId: amyId,
        projectId,
        upload: {
          fileName: 'Orders.zip',
          uploadedAt,
          snapshotKey: `upload__${projectId}@0123456789abcdef`,
          ...(workbooks === undefined ? {} : { workbooks }),
        },
        updatedAt: uploadedAt,
      });
    }

    const first = bodyOf(await amy.request({ method: 'GET', url: `/api/projects/${withBooks}` }));
    const second = bodyOf(await amy.request({ method: 'GET', url: `/api/projects/${without}` }));

    expect(first['source']).toMatchObject({ workbooks: 3 });
    expect(second['source']).not.toHaveProperty('workbooks');
  });
});

describe('GET /api/session and the workbook limit', () => {
  it('RF-158 tells the page the most workbooks of a project when the server has a limit', async () => {
    const test = createTestServer({ workbookMaxFiles: 12 });
    const user = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, user);

    const response = await browser.request({ method: 'GET', url: '/api/session' });
    await test.server.close();

    expect(response.json()).toMatchObject({ workbookMaxFiles: 12 });
  });

  it('RF-158 leaves the field out when the server states no limit', async () => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'GET', url: '/api/session' });

    expect(bodyOf(response)).not.toHaveProperty('workbookMaxFiles');
  });
});
