import { describe, expect, it, vi } from 'vitest';
import { workbookBatch, zipBatch } from '../../../support/late-attach-harness.js';

// RF-159: a batch whose late attach has not settled is not swept away after 30 minutes, and the server
// shutdown waits for it.

const THIRTY_ONE_MINUTES = 31 * 60_000;

describe.each([
  ['WorkbookBatches', workbookBatch],
  ['StoreUpload', zipBatch],
])('%s a batch with a late attach that has not settled', (_name, start) => {
  it('RF-159 is kept by the sweep, and reads stored when the attach lands', async () => {
    const { world, ref, attach, batches } = await start();
    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('refused');
    });

    world.clock.advance(THIRTY_ONE_MINUTES);
    const kept = await batches.state(ref);
    attach.release();

    expect(kept.ok && kept.value.phase).toBe('refused');
    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('stored');
    });
  });

  it('RF-159 is awaited by close', async () => {
    const { ref, attach, batches } = await start();
    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('refused');
    });
    let closed = false;
    const closing = batches.close().then(() => {
      closed = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(false);
    attach.release();

    await closing;
    expect(closed).toBe(true);
  });
});
