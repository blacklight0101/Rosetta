import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach } from 'vitest';
import { z } from 'zod';
import { SpaceReservation } from '../../src/infrastructure/sources/space-reservation.js';
import { DiskWorkbookStaging } from '../../src/infrastructure/sources/workbook-staging.js';
import type { WorkbookLimits } from '../../src/infrastructure/sources/workbook/workbook-limits.js';
import { addUser, signedInBrowser, type TestBrowser } from './test-browser.js';
import { storeIn } from './upload-store-harness.js';
import { createTestServer, type TestServer } from './web-server.js';
import { idOf } from './upload-route-harness.js';
import { removeWritableTree } from './writable-temp-root.js';

// RF-150, RF-1105: servers whose batch store is the real one over a temporary data folder, two users
// signed in, and the calls the batch route tests make.

export interface WorkbookSetup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly amyId: string;
  readonly dataDir: string;
  readonly staging: DiskWorkbookStaging;
}

export interface WorkbookOptions {
  readonly uploadMaxMb?: number;
  readonly freeBytes?: () => Promise<number>;
  readonly limits?: Partial<WorkbookLimits>;
}

/** Opens the servers of a test file over a fresh data folder and closes them after each test. */
export function useWorkbookServers(): (options?: WorkbookOptions) => Promise<WorkbookSetup> {
  const open: TestServer[] = [];
  const folders: string[] = [];
  afterEach(async () => {
    for (const test of open.splice(0)) await test.server.close();
    for (const folder of folders.splice(0)) await removeWritableTree(folder);
  });
  return async (options = {}) => {
    const dataDir = await realpath(await mkdtemp(join(tmpdir(), 'rst-batch-http-')));
    folders.push(dataDir);
    const space = new SpaceReservation({
      dataDir,
      ...(options.freeBytes === undefined ? {} : { freeBytes: options.freeBytes }),
    });
    const staging = new DiskWorkbookStaging({
      dataDir,
      reservation: space,
      ...(options.limits === undefined ? {} : { limits: options.limits }),
    });
    const test = createTestServer({
      uploads: storeIn(dataDir, { reservation: space }),
      workbookStaging: staging,
      uploadMaxMb: options.uploadMaxMb ?? 1,
    });
    open.push(test);
    const amyUser = await addUser(test, { userName: 'amy' });
    const bobUser = await addUser(test, { userName: 'bob' });
    return {
      ...{ test, dataDir, staging },
      amy: await signedInBrowser(test.server, amyUser),
      bob: await signedInBrowser(test.server, bobUser),
      amyId: amyUser.account.id,
    };
  };
}

const batchBody = z.object({ batchId: z.string() });

export async function createWorkbookProject(
  browser: TestBrowser,
  name = 'Pricing',
): Promise<string> {
  return idOf(
    await browser.request({
      method: 'POST',
      url: '/api/projects',
      payload: { sourceKind: 'workbook', name },
    }),
  );
}

export const batchesUrl = (projectId: string): string =>
  `/api/projects/${projectId}/source/batches`;

export async function openBatch(browser: TestBrowser, projectId: string): Promise<string> {
  const response = await browser.request({ method: 'POST', url: batchesUrl(projectId) });
  return batchBody.parse(response.json()).batchId;
}

export function putFile(
  browser: TestBrowser,
  target: { readonly projectId: string; readonly batchId: string },
  file: { readonly name: string; readonly bytes: Buffer },
  extra: { headers?: Record<string, string>; origin?: string | null; csrf?: boolean | string } = {},
): Promise<LightMyRequestResponse> {
  const { headers = {}, ...rest } = extra;
  return browser.request({
    method: 'PUT',
    url: `${batchesUrl(target.projectId)}/${target.batchId}/files`,
    payload: file.bytes,
    headers: {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
      ...headers,
    },
    ...rest,
  });
}

export function finishBatch(
  browser: TestBrowser,
  target: { readonly projectId: string; readonly batchId: string },
  extra: { origin?: string | null; csrf?: boolean | string } = {},
): Promise<LightMyRequestResponse> {
  return browser.request({
    method: 'POST',
    url: `${batchesUrl(target.projectId)}/${target.batchId}/finish`,
    ...extra,
  });
}

export function cancelBatch(
  browser: TestBrowser,
  target: { readonly projectId: string; readonly batchId: string },
): Promise<LightMyRequestResponse> {
  return browser.request({
    method: 'DELETE',
    url: `${batchesUrl(target.projectId)}/${target.batchId}`,
  });
}

export function batchState(
  browser: TestBrowser,
  target: { readonly projectId: string; readonly batchId: string },
): Promise<LightMyRequestResponse> {
  return browser.request({
    method: 'GET',
    url: `${batchesUrl(target.projectId)}/${target.batchId}`,
  });
}

/** RF-159: the batch of the project, found without its id. */
export function currentBatch(
  browser: TestBrowser,
  projectId: string,
): Promise<LightMyRequestResponse> {
  return browser.request({ method: 'GET', url: `${batchesUrl(projectId)}/current` });
}

/** What a reader of the finish sees once the work after the request has ended (RF-159). */
export interface Finished {
  readonly statusCode: number;
  json(): unknown;
}

const stateBody = z.looseObject({
  phase: z.string(),
  summary: z.unknown().optional(),
  refusal: z.looseObject({ status: z.number() }).optional(),
});

/**
 * Asks for the state of a batch that was accepted every few milliseconds until it ends: the summary
 * with 201 when it was stored, the refusal with its own status when it was refused.
 */
export async function settledBatch(
  browser: TestBrowser,
  target: { readonly projectId: string; readonly batchId: string },
): Promise<Finished> {
  for (let turn = 0; turn < 2000; turn += 1) {
    const state = stateBody.parse((await batchState(browser, target)).json());
    if (state.phase === 'stored') return { statusCode: 201, json: () => state.summary };
    if (state.refusal !== undefined) {
      const { status, ...body } = state.refusal;
      return { statusCode: status, json: () => body };
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('the batch did not end');
}

/** Finishes the batch and waits for the work after the request; an answer that is not 202 is returned as it is. */
export async function finishedBatch(
  browser: TestBrowser,
  target: { readonly projectId: string; readonly batchId: string },
): Promise<Finished> {
  const accepted = await finishBatch(browser, target);
  return accepted.statusCode === 202 ? settledBatch(browser, target) : accepted;
}
