import type { LightMyRequestResponse } from 'fastify';
import { afterEach } from 'vitest';
import { z } from 'zod';
import { FakeUploadStore } from './fake-upload-store.js';
import { addUser, signedInBrowser, type TestBrowser } from './test-browser.js';
import { createTestServer, type TestServer } from './web-server.js';

// RF-128, RF-1105: two signed-in users over a test server whose upload store is a fake, and the
// calls the upload route tests make.

export interface UploadSetup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly amyId: string;
  readonly uploads: FakeUploadStore;
}

/** Opens the servers of a test file and closes them after each test. */
export function useUploadServers(): (options?: {
  readonly uploadMaxMb?: number;
}) => Promise<UploadSetup> {
  const open: TestServer[] = [];
  afterEach(async () => {
    for (const test of open.splice(0)) await test.server.close();
  });
  return async (options = {}) => {
    const uploads = new FakeUploadStore();
    const test = createTestServer({ uploads, ...options });
    open.push(test);
    const amyUser = await addUser(test, { userName: 'amy' });
    const bobUser = await addUser(test, { userName: 'bob' });
    return {
      test,
      uploads,
      amy: await signedInBrowser(test.server, amyUser),
      bob: await signedInBrowser(test.server, bobUser),
      amyId: amyUser.account.id,
    };
  };
}

const record = z.record(z.string(), z.unknown());
const withId = z.looseObject({ id: z.string() });
const overview = z.looseObject({ projects: z.array(z.looseObject({ project: record })) });
const listing = z.looseObject({ projects: z.array(record) });

/** The JSON body of a response as an object of unknown values. */
export function bodyOf(response: LightMyRequestResponse): Record<string, unknown> {
  return record.parse(response.json());
}

/** The id in the body of a response that created or showed a project. */
export function idOf(response: LightMyRequestResponse): string {
  return withId.parse(response.json()).id;
}

/** The first project of `GET /api/projects/overview`. */
export function overviewProject(response: LightMyRequestResponse): Record<string, unknown> {
  return overview.parse(response.json()).projects[0]?.project ?? {};
}

/** The first project of `GET /api/projects`. */
export function listedProject(response: LightMyRequestResponse): Record<string, unknown> {
  return listing.parse(response.json()).projects[0] ?? {};
}

export async function createUploadProject(
  browser: TestBrowser,
  name = 'OrderDesk',
): Promise<string> {
  return idOf(
    await browser.request({
      method: 'POST',
      url: '/api/projects',
      payload: { sourceKind: 'upload', name },
    }),
  );
}

export const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

export function put(
  browser: TestBrowser,
  id: string,
  extra: { headers?: Record<string, string>; origin?: string | null; csrf?: boolean | string } = {},
): Promise<LightMyRequestResponse> {
  const { headers = {}, ...rest } = extra;
  return browser.request({
    method: 'PUT',
    url: `/api/projects/${id}/source`,
    payload: zipBytes,
    headers: { 'content-type': 'application/zip', ...headers },
    ...rest,
  });
}
