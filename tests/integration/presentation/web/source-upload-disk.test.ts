import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { idOf } from '../../../support/upload-route-harness.js';
import { sourcesOf, useDiskServers, type DiskSetup } from '../../../support/upload-disk-harness.js';
import { MB, sampleZip } from '../../../support/upload-store-harness.js';

// RF-128, RF-129: PUT /api/projects/:id/source over the real upload store and a real data folder.

const setup = useDiskServers();

async function project(amy: DiskSetup['amy']): Promise<string> {
  return idOf(
    await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { sourceKind: 'upload', name: 'OrderDesk' },
    }),
  );
}

function put(amy: DiskSetup['amy'], id: string, payload: Buffer | Readable) {
  return amy.request({
    method: 'PUT',
    url: `/api/projects/${id}/source`,
    payload,
    headers: { 'content-type': 'application/zip', 'x-file-name': 'OrderDesk.zip' },
  });
}

/** A body that sends its first bytes, then waits for `release` before it ends. */
function held(first: Buffer, rest: Buffer): { body: Readable; release: () => void } {
  const gate: { release: () => void } = { release: () => undefined };
  const waiting = new Promise<void>((resolve) => {
    gate.release = resolve;
  });
  const body = Readable.from(
    (async function* () {
      yield first;
      await waiting;
      yield rest;
    })(),
  );
  return { body, release: gate.release };
}

describe('PUT /api/projects/:id/source with the real store', () => {
  it('RF-128 stores the zip as a snapshot, answers what was kept and keeps no zip', async () => {
    const { amy, dataDir } = await setup();
    const id = await project(amy);

    const response = await put(amy, id, await sampleZip());

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ files: 2, skipped: 0, fileName: 'OrderDesk.zip' });
    const folders = await sourcesOf(dataDir);
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatch(/^upload__[0-9a-f-]{36}@[0-9a-f]{16}$/u);
  });

  it('RF-128 a second, different zip replaces the first when no run uses it', async () => {
    const { amy, dataDir } = await setup();
    const id = await project(amy);
    await put(amy, id, await sampleZip());

    const response = await put(amy, id, Buffer.concat([await sampleZip(), Buffer.alloc(0)]));
    expect(response.statusCode).toBe(201);
    const other = await put(amy, id, await changedZip());

    expect(other.statusCode).toBe(201);
    expect(await sourcesOf(dataDir)).toHaveLength(1);
  });

  it('RF-129 a body that is not a zip answers 400 RST-1909 and leaves nothing behind', async () => {
    const { amy, dataDir } = await setup();
    const id = await project(amy);

    const response = await put(amy, id, Buffer.from('this is not a zip file at all'));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.zipNotReadable });
    expect(await sourcesOf(dataDir)).toEqual([]);
  });
});

describe('PUT /api/projects/:id/source limits', () => {
  it('RF-129 a Content-Length over the limit answers 413 RST-1916 and leaves nothing', async () => {
    const { amy, dataDir } = await setup();
    const id = await project(amy);

    const response = await put(amy, id, Buffer.alloc(MB + 1, 1));

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.uploadTooLarge });
    expect(await sourcesOf(dataDir)).toEqual([]);
  });

  it('RF-129 free space just under twice the limit answers 507 RST-1917; twice the limit is enough', async () => {
    const low = await setup({ freeBytes: () => Promise.resolve(2 * MB - 1) });
    const lowId = await project(low.amy);
    const enough = await setup({ freeBytes: () => Promise.resolve(2 * MB) });
    const enoughId = await project(enough.amy);

    const refused = await put(low.amy, lowId, await sampleZip());
    const accepted = await put(enough.amy, enoughId, await sampleZip());

    expect(refused.statusCode).toBe(507);
    expect(refused.json()).toMatchObject({ code: ERROR_CODES.uploadNoSpace });
    expect(await sourcesOf(low.dataDir)).toEqual([]);
    expect(accepted.statusCode).toBe(201);
  });
});

describe('PUT /api/projects/:id/source at the same time', () => {
  it('RF-128 two uploads of one project: the second answers 409 RST-1919', async () => {
    const { amy, dataDir } = await setup();
    const id = await project(amy);
    const zip = await sampleZip();
    const first = held(zip.subarray(0, 10), zip.subarray(10));
    const firstResponse = put(amy, id, first.body);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = await put(amy, id, zip);
    first.release();

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: ERROR_CODES.uploadInProgress });
    expect((await firstResponse).statusCode).toBe(201);
    expect(await sourcesOf(dataDir)).toHaveLength(1);
  });

  it('RF-133 the project deleted during its upload leaves no snapshot and answers 404', async () => {
    const { amy, dataDir } = await setup();
    const id = await project(amy);
    const zip = await sampleZip();
    const first = held(zip.subarray(0, 10), zip.subarray(10));
    const response = put(amy, id, first.body);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const deleted = await amy.request({ method: 'DELETE', url: `/api/projects/${id}` });
    first.release();

    expect(deleted.statusCode).toBe(200);
    expect((await response).statusCode).toBe(404);
    expect(await sourcesOf(dataDir)).toEqual([]);
  });
});

async function changedZip(): Promise<Buffer> {
  const { buildZip } = await import('../../../support/zip-fixtures.js');
  return buildZip([{ name: 'OrderDesk/src/Orders.cs', data: 'class Orders { int changed; }' }]);
}
