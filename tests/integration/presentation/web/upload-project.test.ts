import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { bodyOf, useUploadServers } from '../../../support/upload-route-harness.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer } from '../../../support/web-server.js';

// RF-128, RF-010, RF-134: POST /api/projects with { sourceKind: 'upload', name }, the GitHub body
// that stays as it was, and the upload limit that GET /api/session tells the page.

const setup = useUploadServers();

describe('POST /api/projects with an upload', () => {
  it('RF-128 creates a project of kind upload with no source and answers 201', async () => {
    const { amy } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { sourceKind: 'upload', name: 'OrderDesk' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'OrderDesk',
      sourceKind: 'upload',
      source: null,
      sourceUrl: '',
      ref: '',
      subpath: '',
      codeChangedSinceLastRun: false,
    });
  });

  it('RF-128 the project is listed for its owner and for nobody else', async () => {
    const { amy, bob } = await setup();
    await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { sourceKind: 'upload', name: 'OrderDesk' },
    });

    const own = await amy.request({ method: 'GET', url: '/api/projects' });
    const foreign = await bob.request({ method: 'GET', url: '/api/projects' });

    expect(own.json()).toMatchObject({ projects: [{ name: 'OrderDesk' }] });
    expect(foreign.json()).toEqual({ projects: [] });
  });
});

describe('POST /api/projects with a refused upload body', () => {
  it.each([
    [{ sourceKind: 'upload', name: '' }],
    [{ sourceKind: 'upload', name: '   ' }],
    [{ sourceKind: 'upload', name: 'x'.repeat(201) }],
    [{ sourceKind: 'upload' }],
    [{ sourceKind: 'upload', name: 5 }],
    [{ sourceKind: 'upload', name: 'a', url: 'https://github.com/o/r' }],
    [{ sourceKind: 'folder', name: 'a' }],
  ])('RF-128 the body %j answers 400 RST-2000 and creates nothing', async (payload) => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'POST', url: '/api/projects', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    const list = await amy.request({ method: 'GET', url: '/api/projects' });
    expect(list.json()).toEqual({ projects: [] });
  });
});

describe('POST /api/projects with a GitHub body', () => {
  it('RF-010 still creates a GitHub project and names its source kind', async () => {
    const { amy } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { url: 'https://github.com/owner/repo' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ sourceKind: 'github', source: null });
    expect(bodyOf(response)).not.toHaveProperty('codeChangedSinceLastRun');
  });

  it('RF-010 refuses a body over the same 4 KiB limit as before', async () => {
    const { amy } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { sourceKind: 'upload', name: 'x'.repeat(5000) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });
});

describe('GET /api/session and the upload limit', () => {
  it('RF-134 tells the page the limit when the server has one', async () => {
    const test = createTestServer({ uploadMaxMb: 100 });
    const user = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, user);

    const response = await browser.request({ method: 'GET', url: '/api/session' });
    await test.server.close();

    expect(response.json()).toMatchObject({ uploadMaxMb: 100 });
  });

  it('RF-134 leaves the field out when the server states no limit', async () => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'GET', url: '/api/session' });

    expect(bodyOf(response)).not.toHaveProperty('uploadMaxMb');
  });
});
