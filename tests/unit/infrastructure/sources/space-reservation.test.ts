import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SpaceReservation } from '../../../../src/infrastructure/sources/space-reservation.js';
import { removeWritableTree } from '../../../support/writable-temp-root.js';

// DEC-149, RF-129: one reservation of free space serves every upload that writes under the data
// folder, so a zip and a workbook batch that start together cannot each pass against the same bytes.

const folders: string[] = [];

afterEach(async () => {
  for (const folder of folders.splice(0)) await removeWritableTree(folder);
});

function reservationWith(free: number): SpaceReservation {
  return new SpaceReservation({ dataDir: '.', freeBytes: () => Promise.resolve(free) });
}

describe('SpaceReservation', () => {
  it('DEC-149 holds back what it gave: the second of two reservations that do not both fit is refused', async () => {
    const space = reservationWith(250);

    await space.reserve(200);

    await expect(space.reserve(200)).rejects.toMatchObject({ code: ERROR_CODES.uploadNoSpace });
  });

  it('DEC-149 gives the bytes back when the first is released, once however often it is called', async () => {
    const space = reservationWith(250);
    const release = await space.reserve(200);

    release();
    release();

    await expect(space.reserve(200)).resolves.toBeTypeOf('function');
    await expect(space.reserve(200)).rejects.toMatchObject({ code: ERROR_CODES.uploadNoSpace });
  });

  it('DEC-149 lets only one of two reservations that start together pass', async () => {
    const space = reservationWith(250);

    const outcomes = await Promise.allSettled([space.reserve(200), space.reserve(200)]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('DEC-149 asks the file system of the data folder when it is not told the free bytes', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-space-'));
    folders.push(dataDir);
    const space = new SpaceReservation({ dataDir });

    await expect(space.reserve(1024)).resolves.toBeTypeOf('function');
    await expect(space.reserve(Number.MAX_SAFE_INTEGER)).rejects.toMatchObject({
      code: ERROR_CODES.uploadNoSpace,
    });
  });
});
