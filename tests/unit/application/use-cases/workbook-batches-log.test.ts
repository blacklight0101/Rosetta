import { describe, expect, it, vi } from 'vitest';
import {
  amy,
  batchCase,
  fileRequest,
  type BatchCase,
} from '../../../support/workbook-batch-harness.js';

// RF-158, RF-159: a user's Cancel of a batch at work is told at info level; any other failure stays an
// error, so the log keeps its alarms for what nobody expected.

async function working(world: BatchCase) {
  const opened = await world.useCase.open({ actor: amy, projectId: world.project.id });
  if (!opened.ok) throw new Error('open refused');
  const { batchId } = opened.value;
  await world.useCase.receive(fileRequest(world.project, batchId));
  let release: () => void = () => undefined;
  world.staging.duringPublish = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const ref = { actor: amy, projectId: world.project.id, batchId };
  await world.useCase.finish({ ...ref, ip: '203.0.113.7' });
  await vi.waitFor(() => {
    expect(world.staging.published).toEqual([batchId]);
  });
  return {
    ref,
    release: () => {
      release();
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const levels = (world: BatchCase) => world.logger.entries.map((entry) => entry.level);

describe('WorkbookBatches the log of a batch that did not end well', () => {
  it('RF-159 tells a Cancel at info level and logs no error', async () => {
    const world = await batchCase();
    const { ref, release } = await working(world);

    const cancelling = world.useCase.cancel(ref);
    await settle();
    release();
    await cancelling;
    await settle();

    expect(levels(world)).not.toContain('error');
    expect(world.logger.entries.filter((entry) => entry.level === 'info')).toHaveLength(1);
  });

  it('RF-158 still logs an error nobody expected, once, at error level', async () => {
    const world = await batchCase();
    world.staging.publishFails = new Error('the disk went away');
    const { ref, release } = await working(world);

    release();
    await vi.waitFor(async () => {
      const state = await world.useCase.state(ref);
      expect(state.ok && state.value.phase).toBe('refused');
    });

    expect(levels(world).filter((level) => level === 'error')).toHaveLength(1);
    expect(levels(world)).not.toContain('info');
  });
});
