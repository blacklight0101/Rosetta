import { describe, expect, it } from 'vitest';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';
import {
  bodyOf,
  MB,
  otherProjectId,
  requestOf,
  sampleZip,
  sourcesEntries,
  storeIn,
} from '../../../support/upload-store-harness.js';

// RF-129, DEC-149: the free-space check reserves what a running upload may need, so uploads that
// start together cannot each pass against the same free bytes. The reservation ends with the upload.

const root = useWritableTempRoot('rosetta-upload-reserve-');

/** Room for exactly one upload at the 1 MB limit: twice the limit, plus a little. */
const ROOM_FOR_ONE = 2 * MB + 1024;

/** A body that starts, tells the test it is being read, and waits to be let go. */
function gatedBody(zip: Buffer): {
  readonly body: AsyncIterable<Uint8Array>;
  readonly reading: Promise<void>;
  readonly release: () => void;
} {
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const body = (async function* () {
    started();
    await gate;
    yield zip;
  })();
  return { body, reading, release };
}

describe('ZipUploadStore the free-space reservation', () => {
  it('RF-129 refuses the second of two uploads started together with room for one, for space', async () => {
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(ROOM_FOR_ONE) });
    const first = gatedBody(await sampleZip());
    const running = store.store(requestOf(first.body));
    await first.reading;

    await expect(
      store.store(requestOf(bodyOf(await sampleZip()), { projectId: otherProjectId })),
    ).rejects.toMatchObject({ code: 'RST-1917' });
    first.release();

    await expect(running).resolves.toMatchObject({ info: { fileCount: 2 } });
  });

  it('RF-129 checks both uploads against the free bytes at once, even when asked in the same tick', async () => {
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(ROOM_FOR_ONE) });
    const gate = gatedBody(await sampleZip());
    const zip = await sampleZip();

    const outcomes = await Promise.allSettled([
      store.store(requestOf(gate.body)),
      store.store(requestOf(bodyOf(zip), { projectId: otherProjectId })),
      Promise.resolve().then(gate.release),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
  });

  it('RF-129 lets two uploads run together when the room is there for both', async () => {
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(2 * ROOM_FOR_ONE) });
    const first = gatedBody(await sampleZip());
    const running = store.store(requestOf(first.body));
    await first.reading;

    const second = await store.store(
      requestOf(bodyOf(await sampleZip()), { projectId: otherProjectId }),
    );
    first.release();

    expect(second.info.fileCount).toBe(2);
    await expect(running).resolves.toBeDefined();
  });
});

describe('ZipUploadStore the reservation ends with the upload', () => {
  it('RF-129 releases the reservation when an upload fails, so the next one has room', async () => {
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(ROOM_FOR_ONE) });
    const notAZip = bodyOf(Buffer.from('this is not a zip archive at all'));

    await expect(store.store(requestOf(notAZip))).rejects.toMatchObject({ code: 'RST-1909' });
    const next = await store.store(
      requestOf(bodyOf(await sampleZip()), { projectId: otherProjectId }),
    );

    expect(next.info.fileCount).toBe(2);
  });

  it('RF-129 releases the reservation when the body is cut off midway', async () => {
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(ROOM_FOR_ONE) });
    const broken = (async function* () {
      await Promise.resolve();
      yield Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      throw new Error('connection reset');
    })();

    await expect(store.store(requestOf(broken))).rejects.toBeInstanceOf(Error);
    const next = await store.store(requestOf(bodyOf(await sampleZip())));

    expect(next.info.fileCount).toBe(2);
  });
});

describe('ZipUploadStore the reservation after a finished upload', () => {
  it('RF-129 releases the reservation when the upload succeeds, so the next one has room', async () => {
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(ROOM_FOR_ONE) });

    await store.store(requestOf(bodyOf(await sampleZip())));
    const next = await store.store(
      requestOf(bodyOf(await sampleZip()), { projectId: otherProjectId }),
    );

    expect(next.info.fileCount).toBe(2);
  });

  it('RF-129 a refused upload reserves nothing and leaves no folder behind', async () => {
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(ROOM_FOR_ONE - MB) });

    await expect(store.store(requestOf(bodyOf(await sampleZip())))).rejects.toMatchObject({
      code: 'RST-1917',
    });
    await expect(store.store(requestOf(bodyOf(await sampleZip())))).rejects.toMatchObject({
      code: 'RST-1917',
    });

    expect(await sourcesEntries(root.path)).toEqual([]);
  });
});
