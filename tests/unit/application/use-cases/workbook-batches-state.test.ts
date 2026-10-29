import { describe, expect, it, vi } from 'vitest';
import type { WorkbookProgress } from '../../../../src/application/ports/workbook-staging.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  amy,
  batchCase,
  bob,
  fileRequest,
  type BatchCase,
} from '../../../support/workbook-batch-harness.js';

// RF-159, RF-158, RF-1105, DEC-183: finishing a batch is accepted at once; the work goes on after the
// request and its state (step, counts, elapsed time, outcome) can be read, also after a reload.

const THIRTY_MINUTES = 30 * 60_000;
const rendering: WorkbookProgress = {
  ...{ step: 'rendering', workbook: 2, workbooks: 3, sheet: 4, sheets: 9, cells: 1200 },
};

async function withFile(test: BatchCase): Promise<string> {
  const opened = await test.useCase.open({ actor: amy, projectId: test.project.id });
  if (!opened.ok) throw new Error('open refused');
  await test.useCase.receive(fileRequest(test.project, opened.value.batchId));
  return opened.value.batchId;
}

const ref = (test: BatchCase, batchId: string, actor: Actor = amy) => ({
  ...{ actor, projectId: test.project.id, batchId },
});
const finishOf = (test: BatchCase, batchId: string) => ({
  ...ref(test, batchId),
  ip: '203.0.113.7',
});

/** Holds the publish of the staging area until the returned function is called. */
function holdPublish(test: BatchCase): () => void {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  test.staging.duringPublish = () => held;
  return release;
}

async function stateOf(test: BatchCase, batchId: string) {
  const state = await test.useCase.state(ref(test, batchId));
  if (!state.ok) throw new Error(`state refused: ${state.error}`);
  return state.value;
}

async function waitForPhase(test: BatchCase, batchId: string, phase: string): Promise<void> {
  await vi.waitFor(async () => {
    expect((await stateOf(test, batchId)).phase).toBe(phase);
  });
}

describe('WorkbookBatches.finish accepts the batch at once', () => {
  it('RF-159 answers before the work ends and reports the step, the counts and the elapsed time', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    test.staging.reports = [rendering];
    const release = holdPublish(test);

    const accepted = await test.useCase.finish(finishOf(test, batchId));
    test.clock.advance(4000);

    expect(accepted).toMatchObject({ ok: true, value: { phase: 'processing', files: 1 } });
    expect(await stateOf(test, batchId)).toMatchObject({
      batchId,
      phase: 'processing',
      files: 1,
      elapsedMs: 4000,
      progress: rendering,
    });
    expect(test.staging.published).toEqual([batchId]);
    release();
  });

  it('RF-159 keeps the summary in the state when the work ends, and the elapsed time stops', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    const release = holdPublish(test);
    await test.useCase.finish(finishOf(test, batchId));
    test.clock.advance(2500);
    release();
    await waitForPhase(test, batchId, 'stored');
    test.clock.advance(60_000);

    const state = await stateOf(test, batchId);

    expect(state.elapsedMs).toBe(2500);
    expect(state.summary?.workbooks.map((book) => book.name)).toEqual(['Pricing.xlsx']);
    expect((await test.projects.find(amy.userId, test.project.id))?.upload?.workbooks).toBe(1);
  });
});

describe('WorkbookBatches.finish while at work', () => {
  it('RF-159 refuses a second finish while the first is at work with RST-1919', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    const release = holdPublish(test);
    await test.useCase.finish(finishOf(test, batchId));

    const again = await test.useCase.finish(finishOf(test, batchId));
    const file = await test.useCase.receive(fileRequest(test.project, batchId));

    expect(again).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    expect(file).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    release();
  });
});

describe('WorkbookBatches.finish and cancel', () => {
  it('RF-159 cancel while at work stops it, publishes nothing and frees the project', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    const release = holdPublish(test);
    await test.useCase.finish(finishOf(test, batchId));

    const cancelled = await test.useCase.cancel(ref(test, batchId));
    release();
    await vi.waitFor(() => {
      expect(test.staging.discarded).toContain(batchId);
    });

    expect(cancelled.ok).toBe(true);
    expect(await test.useCase.state(ref(test, batchId))).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
    expect((await test.projects.find(amy.userId, test.project.id))?.upload).toBeUndefined();
    expect((await test.useCase.open({ actor: amy, projectId: test.project.id })).ok).toBe(true);
  });
});

describe('WorkbookBatches.cancel that comes when the work is done or nearly done', () => {
  it('RF-159 cancel after the batch was stored leaves it, answers its state and keeps the source', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    await test.useCase.finish(finishOf(test, batchId));
    await waitForPhase(test, batchId, 'stored');

    const cancelled = await test.useCase.cancel(ref(test, batchId));

    expect(cancelled).toMatchObject({
      ok: true,
      value: { cancelled: false, state: { batchId, phase: 'stored' } },
    });
    expect((await stateOf(test, batchId)).phase).toBe('stored');
    expect((await test.projects.find(amy.userId, test.project.id))?.upload?.workbooks).toBe(1);
  });

  it('RF-159 cancel that lands after the publish attaches nothing and removes the snapshot', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    const publish = test.staging.publish.bind(test.staging);
    const release = holdPublish(test);
    vi.spyOn(test.staging, 'publish').mockImplementation(async (id, request) => {
      // The publish ends without seeing the cancel: only the attach is left.
      return publish(id, { ...request, signal: new AbortController().signal });
    });
    await test.useCase.finish(finishOf(test, batchId));

    expect((await test.useCase.cancel(ref(test, batchId))).ok).toBe(true);
    release();

    await vi.waitFor(() => {
      expect(test.uploads.removed).toHaveLength(1);
    });
    expect((await test.projects.find(amy.userId, test.project.id))?.upload).toBeUndefined();
  });
});

describe('WorkbookBatches.state after acceptance', () => {
  it('RF-158 shows a refusal after acceptance with its error and publishes nothing', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    test.staging.publishFails = new RosettaError(ERROR_CODES.workbookEncrypted);
    await test.useCase.finish(finishOf(test, batchId));

    await waitForPhase(test, batchId, 'refused');

    const state = await stateOf(test, batchId);
    expect(state.refusal).toMatchObject({ code: ERROR_CODES.workbookEncrypted });
    expect((await test.projects.find(amy.userId, test.project.id))?.upload).toBeUndefined();
    expect(test.staging.discarded).toContain(batchId);
  });

  it('RF-159 does not lose an unexpected error: it is in the state and in the log', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    test.staging.publishFails = new Error('the disk went away');
    await test.useCase.finish(finishOf(test, batchId));

    await waitForPhase(test, batchId, 'refused');

    expect((await stateOf(test, batchId)).refusal).toBeInstanceOf(Error);
    expect(test.logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(1);
  });
});

describe('WorkbookBatches.state and current', () => {
  it('RF-1105 answers not found for the batch of another user and for an unknown one', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);

    const foreign = await test.useCase.state(ref(test, batchId, bob));
    const unknown = await test.useCase.state(ref(test, 'no-such-batch'));
    const foreignCurrent = await test.useCase.current({ actor: bob, projectId: test.project.id });

    for (const outcome of [foreign, unknown, foreignCurrent]) {
      expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    }
  });

  it('RF-159 finds the batch of the project without its id: open, at work and ended', async () => {
    const test = await batchCase();
    const none = await test.useCase.current({ actor: amy, projectId: test.project.id });
    const batchId = await withFile(test);
    const release = holdPublish(test);
    const open = await test.useCase.current({ actor: amy, projectId: test.project.id });
    await test.useCase.finish(finishOf(test, batchId));
    const working = await test.useCase.current({ actor: amy, projectId: test.project.id });
    release();
    await waitForPhase(test, batchId, 'stored');
    const ended = await test.useCase.current({ actor: amy, projectId: test.project.id });

    expect(none).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(open.ok && [open.value.batchId, open.value.phase]).toEqual([batchId, 'open']);
    expect(working.ok && working.value.phase).toBe('processing');
    expect(ended.ok && ended.value.phase).toBe('stored');
  });
});

describe('WorkbookBatches the lifetime of a batch that was finished', () => {
  it('RF-159 does not expire a batch at work, and keeps its outcome 30 minutes after the end', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    test.clock.advance(THIRTY_MINUTES - 1000);
    const release = holdPublish(test);
    await test.useCase.finish(finishOf(test, batchId));
    test.clock.advance(2 * 60_000);
    expect((await stateOf(test, batchId)).phase).toBe('processing');
    release();
    await waitForPhase(test, batchId, 'stored');

    test.clock.advance(THIRTY_MINUTES - 1000);
    const kept = await test.useCase.state(ref(test, batchId));
    test.clock.advance(2000);
    const gone = await test.useCase.state(ref(test, batchId));

    expect(kept.ok).toBe(true);
    expect(gone).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });

  it('RF-159 replaces an ended batch when a new one is opened', async () => {
    const test = await batchCase();
    const batchId = await withFile(test);
    await test.useCase.finish(finishOf(test, batchId));
    await waitForPhase(test, batchId, 'stored');

    const next = await test.useCase.open({ actor: amy, projectId: test.project.id });

    expect(next.ok && next.value.batchId).not.toBe(batchId);
    expect(await test.useCase.state(ref(test, batchId))).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
  });
});
