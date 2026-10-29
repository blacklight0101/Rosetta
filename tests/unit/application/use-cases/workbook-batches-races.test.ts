import { afterEach, describe, expect, it, vi } from 'vitest';
import { amy, batchCase, bodyOf, fileRequest } from '../../../support/workbook-batch-harness.js';

// RF-150, DEC-149: a finish that ends after its batch was cancelled must not take down the batch
// that replaced it, and a batch left open is freed by the sweep without any further batch call.

const THIRTY_MINUTES = 30 * 60_000;

afterEach(() => {
  vi.useRealTimers();
});

async function opened(test: Awaited<ReturnType<typeof batchCase>>): Promise<string> {
  const outcome = await test.useCase.open({ actor: amy, projectId: test.project.id });
  if (!outcome.ok) throw new Error(`open refused: ${outcome.error}`);
  return outcome.value.batchId;
}

const finishOf = (test: Awaited<ReturnType<typeof batchCase>>, batchId: string) =>
  test.useCase.finish({ actor: amy, projectId: test.project.id, batchId, ip: '203.0.113.7' });

describe('WorkbookBatches a finish that ends after its batch was cancelled', () => {
  it('RF-150 leaves the batch opened since in place: its files are taken and its staging kept', async () => {
    const test = await batchCase();
    const first = await opened(test);
    await test.useCase.receive(fileRequest(test.project, first));
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    test.staging.duringPublish = () => held;
    const finishing = finishOf(test, first);
    await vi.waitFor(() => {
      expect(test.staging.published).toEqual([first]);
    });
    await test.useCase.cancel({ actor: amy, projectId: test.project.id, batchId: first });
    const second = await opened(test);

    release();
    await finishing;
    const file = await test.useCase.receive(
      fileRequest(test.project, second, { fileName: 'Two.xlsx', body: bodyOf(5) }),
    );

    expect(file.ok).toBe(true);
    expect(test.staging.discarded).not.toContain(second);
  });
});

describe('WorkbookBatches a cancel that comes while the source is being attached', () => {
  it('RF-159 waits for the attach and answers the stored state, so it never says nothing was published', async () => {
    const test = await batchCase();
    const batchId = await opened(test);
    await test.useCase.receive(fileRequest(test.project, batchId));
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attach = test.projects.attachUpload.bind(test.projects);
    const attaching = vi.spyOn(test.projects, 'attachUpload').mockImplementation(async (input) => {
      await held;
      return attach(input);
    });
    await finishOf(test, batchId);
    await vi.waitFor(() => {
      expect(attaching).toHaveBeenCalledTimes(1);
    });

    const cancelling = test.useCase.cancel({ actor: amy, projectId: test.project.id, batchId });
    release();
    const cancelled = await cancelling;

    expect(cancelled).toMatchObject({
      ok: true,
      value: { cancelled: false, state: { batchId, phase: 'stored' } },
    });
    expect((await test.projects.find(amy.userId, test.project.id))?.upload?.workbooks).toBe(1);
  });
});

describe('WorkbookBatches the sweep on a timer', () => {
  it('RF-150 frees a batch left open for 30 minutes with no further batch call', async () => {
    vi.useFakeTimers();
    const test = await batchCase();
    test.useCase.startSweeping(60_000);
    const batchId = await opened(test);

    test.clock.advance(THIRTY_MINUTES + 1000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(test.staging.discarded).toEqual([batchId]);
    await test.useCase.close();
  });

  it('RF-150 keeps a batch younger than 30 minutes when the timer runs', async () => {
    vi.useFakeTimers();
    const test = await batchCase();
    test.useCase.startSweeping(60_000);
    await opened(test);

    test.clock.advance(THIRTY_MINUTES - 1000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(test.staging.discarded).toEqual([]);
    await test.useCase.close();
  });

  it('RF-150 stops sweeping once closed', async () => {
    vi.useFakeTimers();
    const test = await batchCase();
    test.useCase.startSweeping(60_000);
    await test.useCase.close();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('WorkbookBatches.close', () => {
  it('RF-150 deletes every open batch, so its reserved space is given back', async () => {
    const test = await batchCase();
    const batchId = await opened(test);

    await test.useCase.close();

    expect(test.staging.discarded).toEqual([batchId]);
  });
});
