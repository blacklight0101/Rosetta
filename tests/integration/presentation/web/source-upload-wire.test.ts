import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { idOf } from '../../../support/upload-route-harness.js';
import {
  listenOn,
  rawPut,
  sourcesOf,
  useDiskServers,
  type DiskSetup,
} from '../../../support/upload-disk-harness.js';
import { MB, sampleZip } from '../../../support/upload-store-harness.js';

// RF-129: PUT /api/projects/:id/source over a real socket, where the length of the body can be
// unknown, can lie, or the connection can break half way.

const setup = useDiskServers();
const zipStart = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const slice = Buffer.alloc(64 * 1024, 1);

async function opened(options?: Parameters<typeof setup>[0]) {
  const server = await setup(options);
  const id = idOf(
    await server.amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { sourceKind: 'upload', name: 'OrderDesk' },
    }),
  );
  return { ...server, id, port: await listenOn(server.test) };
}

const urlOf = (id: string): string => `/api/projects/${id}/source`;

async function leftovers(dataDir: DiskSetup['dataDir']): Promise<string[]> {
  // The store removes its working folder when it notices the connection has gone.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = await sourcesOf(dataDir);
    if (found.length === 0) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return sourcesOf(dataDir);
}

describe('PUT /api/projects/:id/source on the wire', () => {
  it('RF-129 a body of unknown length over the limit is stopped at the limit with 413', async () => {
    const { amy, id, port, dataDir } = await opened();

    const response = await rawPut({
      ...{ port, url: urlOf(id), browser: amy },
      send: ({ write, end }) => {
        write(zipStart);
        // No Content-Length: the body is chunked, the server cannot know its size in advance.
        for (let sent = 0; sent < 3 * MB; sent += slice.length) write(slice);
        end();
      },
    });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: ERROR_CODES.uploadTooLarge });
    expect(await leftovers(dataDir)).toEqual([]);
  });

  it('RF-129 a Content-Length that says less than is sent never lets more than it says in', async () => {
    const { amy, id, port, dataDir } = await opened();

    const response = await rawPut({
      ...{ port, url: urlOf(id), browser: amy, headers: { 'content-length': '10' } },
      send: ({ write, end }) => {
        write(Buffer.concat([zipStart, Buffer.alloc(6, 1)]));
        end();
      },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: ERROR_CODES.zipNotReadable });
    expect(await leftovers(dataDir)).toEqual([]);
  });

  it('RF-129 a Content-Length over the limit that is declared and then not sent answers 413 at once', async () => {
    const { amy, id, port, dataDir } = await opened();

    const response = await rawPut({
      ...{ port, url: urlOf(id), browser: amy, headers: { 'content-length': String(5 * MB) } },
      send: ({ write }) => {
        write(zipStart);
      },
    });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: ERROR_CODES.uploadTooLarge });
    expect(await leftovers(dataDir)).toEqual([]);
  });
});

describe('PUT /api/projects/:id/source aborted', () => {
  it('RF-129 a connection that breaks half way leaves no folder and no zip, and the project can upload again', async () => {
    const { amy, id, port, dataDir } = await opened();
    const zip = await sampleZip();

    const broken = rawPut({
      ...{ port, url: urlOf(id), browser: amy, headers: { 'content-length': String(zip.length) } },
      send: async ({ write, destroy }) => {
        write(zip.subarray(0, 20));
        await new Promise((resolve) => setTimeout(resolve, 100));
        destroy();
      },
    });

    await expect(broken).rejects.toBeDefined();
    expect(await leftovers(dataDir)).toEqual([]);
    const again = await rawPut({
      ...{ port, url: urlOf(id), browser: amy, headers: { 'content-length': String(zip.length) } },
      send: ({ write, end }) => {
        write(zip);
        end();
      },
    });
    expect(again.status).toBe(201);
  });
});
