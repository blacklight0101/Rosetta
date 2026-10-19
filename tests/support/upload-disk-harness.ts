import { request as httpRequest, type IncomingMessage } from 'node:http';
import { mkdtemp, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import type { ZipUploadStore } from '../../src/infrastructure/sources/zip-upload-store.js';
import { removeWritableTree } from './writable-temp-root.js';
import { storeIn } from './upload-store-harness.js';
import { tmpdir } from 'node:os';
import { addUser, signedInBrowser, type TestBrowser } from './test-browser.js';
import { createTestServer, testPublicUrl, type TestServer } from './web-server.js';

// RF-128, RF-129: servers whose upload store is the real one over a temporary data folder, a browser
// signed in on each, and a raw HTTP client for the cases `inject` cannot send (a body of unknown
// length, a Content-Length that lies, a connection that breaks half way).

export interface DiskSetup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly store: ZipUploadStore;
  readonly dataDir: string;
}

export interface DiskOptions {
  readonly uploadMaxMb?: number;
  readonly freeBytes?: () => Promise<number>;
}

/** Opens the servers of a test file over a fresh data folder and closes them after each test. */
export function useDiskServers(): (options?: DiskOptions) => Promise<DiskSetup> {
  const open: TestServer[] = [];
  const folders: string[] = [];
  beforeEach(() => {
    folders.length = 0;
  });
  afterEach(async () => {
    for (const test of open.splice(0)) await test.server.close();
    for (const folder of folders) {
      await removeWritableTree(folder);
    }
  });
  return async (options = {}) => {
    const dataDir = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-upload-http-')));
    folders.push(dataDir);
    const store = storeIn(
      dataDir,
      options.freeBytes === undefined ? {} : { freeBytes: options.freeBytes },
    );
    const test = createTestServer({ uploads: store, uploadMaxMb: options.uploadMaxMb ?? 1 });
    open.push(test);
    const user = await addUser(test, { userName: 'amy' });
    return { test, store, dataDir, amy: await signedInBrowser(test.server, user) };
  };
}

/** The entries under `<data>/sources/`, as the folders a snapshot or a leftover would be. */
export async function sourcesOf(dataDir: string): Promise<string[]> {
  try {
    return await readdir(join(dataDir, 'sources'));
  } catch {
    return [];
  }
}

export interface RawResponse {
  readonly status: number;
  readonly body: unknown;
}

/** What a body writer can do with the request. */
interface Wire {
  readonly write: (chunk: Buffer) => boolean;
  readonly end: () => void;
  readonly destroy: () => void;
}

export interface RawPut {
  readonly port: number;
  readonly url: string;
  readonly browser: TestBrowser;
  readonly headers?: Readonly<Record<string, string>>;
  /** Writes the body; it ends or destroys the request itself. */
  readonly send: (wire: Wire) => Promise<void> | void;
}

function headersOf(browser: TestBrowser, extra: Readonly<Record<string, string>>) {
  const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  return {
    cookie,
    origin: testPublicUrl,
    'x-csrf-token': browser.csrfToken ?? '',
    'content-type': 'application/zip',
    ...extra,
  };
}

function bodyOfResponse(response: IncomingMessage): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('error', reject);
    response.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ status: response.statusCode ?? 0, body: text === '' ? null : JSON.parse(text) });
    });
  });
}

/** Sends a PUT over a real socket; resolves with the answer, or rejects when the connection breaks. */
export function rawPut(options: RawPut): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port: options.port,
        path: options.url,
        method: 'PUT',
        headers: headersOf(options.browser, options.headers ?? {}),
      },
      (response) => {
        bodyOfResponse(response)
          .then((answer) => {
            request.destroy();
            resolve(answer);
          })
          .catch(reject);
      },
    );
    request.on('error', reject);
    const wire = {
      write: (chunk: Buffer) => request.write(chunk),
      end: () => request.end(),
      destroy: () => request.destroy(),
    };
    Promise.resolve(options.send(wire)).catch(reject);
  });
}

/** Starts listening on a free local port and answers it. */
export async function listenOn(test: TestServer): Promise<number> {
  const address = await test.server.listen({ host: '127.0.0.1', port: 0 });
  return Number(new URL(address).port);
}
