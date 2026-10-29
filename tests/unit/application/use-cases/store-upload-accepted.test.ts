import { describe, expect, it } from 'vitest';
import type { WorkbookProgress } from '../../../../src/application/ports/workbook-staging.js';
import type { BatchState } from '../../../../src/application/use-cases/workbook-batches.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { uploadSnapshotKey } from '../../../../src/domain/sources/upload-name.js';
import { amy, request, setup } from '../../../support/store-upload-harness.js';

// RF-159, DEC-183, DEC-188: a zip that holds workbooks is accepted at once and extracted, rendered and
// stored after the request, with the state, the progress, the time bound and the Cancel of a workbook
// batch; a zip without workbooks keeps answering with its summary.

const counts = { sheets: 2, nonEmptyCells: 30, formulas: 4, macroModules: 0, macrosSkipped: 0 };
const entry = {
  fileName: 'docs/Pricing.xlsx',
  folder: 'docs/Pricing.xlsx',
  sizeBytes: 2048,
  sha256: `sha256:${'12'.repeat(32)}`,
  counts,
};
const line = { name: 'docs/Pricing.xlsx', sheets: 2, cells: 30, formulas: 4, macroModules: 0 };
const rendering: WorkbookProgress = {
  ...{ step: 'rendering', workbook: 1, workbooks: 2, sheet: 3, sheets: 5, cells: 400 },
};

function held() {
  return { entries: [entry], lines: [line], leftOut: [] };
}

/** Holds the store open until `release`, as a large zip would. */
function hold(uploads: { gate: Promise<void> | undefined }): () => void {
  let release: () => void = () => undefined;
  uploads.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}

async function accepted(
  outcome: Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['useCase']['execute']>>,
): Promise<BatchState> {
  await Promise.resolve();
  if (!outcome.ok || !('accepted' in outcome.value)) throw new Error('the zip was not accepted');
  return outcome.value.accepted;
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

describe('StoreUpload a zip that holds workbooks is accepted at once', () => {
  it('RF-159 answers with the batch at work while the store has not ended', async () => {
    const { useCase, project, uploads, batches } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    uploads.reports = [rendering];
    const release = hold(uploads);

    const state = await accepted(await useCase.execute(request(project)));
    const read = await batches.state({
      ...{ actor: amy, projectId: project.id },
      batchId: state.batchId,
    });
    release();

    expect(state).toMatchObject({ phase: 'processing', files: 1 });
    expect(read.ok && read.value).toMatchObject({ phase: 'processing', progress: rendering });
  });

  it('RF-159 ends with the summary of the zip, the source of the project and the audit rows', async () => {
    const { useCase, project, uploads, batches, projects, auditLog } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    const release = hold(uploads);
    const state = await accepted(await useCase.execute(request(project)));

    release();
    await settle();
    const read = await batches.current({ actor: amy, projectId: project.id });

    expect(read.ok && read.value).toMatchObject({
      batchId: state.batchId,
      phase: 'stored',
      summary: { files: 7, snapshotHash: uploads.hash, workbooks: [line] },
    });
    expect((await projects.find(amy.userId, project.id))?.upload?.workbooks).toBe(1);
    expect((await auditLog.list({ since: 0 })).map((row) => row.action)).toContain(
      'source.uploaded',
    );
  });
});

describe('StoreUpload a zip whose work fails', () => {
  it('RF-158 ends refused with the error that stopped the work', async () => {
    const { useCase, project, uploads, batches } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    uploads.failWith = new RosettaError(ERROR_CODES.zipNotReadable);
    const state = await accepted(await useCase.execute(request(project)));

    await settle();
    const read = await batches.state({
      ...{ actor: amy, projectId: project.id },
      batchId: state.batchId,
    });

    expect(read.ok && read.value.phase).toBe('refused');
    expect(read.ok && read.value.refusal).toBeInstanceOf(RosettaError);
  });
});

describe('StoreUpload a zip at work and a client that goes away', () => {
  it('RF-159 a client that goes away after the answer does not stop the work', async () => {
    const { useCase, project, uploads, batches } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    uploads.stopsOnAbort = true;
    const release = hold(uploads);
    const closing = new AbortController();
    const state = await accepted(
      await useCase.execute(request(project, { signal: closing.signal })),
    );

    closing.abort();
    release();
    await settle();
    const read = await batches.current({ actor: amy, projectId: project.id });

    expect(read.ok && read.value).toMatchObject({ batchId: state.batchId, phase: 'stored' });
  });

  it('RF-128 a client that goes away before the zip is accepted still stops the upload', async () => {
    const { useCase, project, uploads } = await setup();
    uploads.stopsOnAbort = true;
    const release = hold(uploads);
    const closing = new AbortController();
    const pending = useCase.execute(request(project, { signal: closing.signal }));
    await settle();

    closing.abort();
    release();

    await expect(pending).rejects.toBeDefined();
  });

  it('RF-128 a second zip is refused while the first is being stored, then accepted after it ended', async () => {
    const { useCase, project, uploads } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    const release = hold(uploads);
    await accepted(await useCase.execute(request(project)));

    const second = await useCase.execute(request(project));
    release();
    await settle();
    const third = await useCase.execute(request(project));

    expect(second).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    expect(third.ok).toBe(true);
  });
});

describe('StoreUpload Cancel of a zip at work', () => {
  it('RF-159 publishes nothing: no source, no audit row, and the batch is gone', async () => {
    const { useCase, project, uploads, batches, projects, auditLog } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    uploads.stopsOnAbort = true;
    const release = hold(uploads);
    const state = await accepted(await useCase.execute(request(project)));
    const target = { actor: amy, projectId: project.id, batchId: state.batchId };

    const cancelled = await batches.cancel(target);
    release();
    await settle();

    expect(cancelled).toEqual({ ok: true, value: { cancelled: true } });
    expect((await batches.state(target)).ok).toBe(false);
    expect((await projects.find(amy.userId, project.id))?.upload).toBeUndefined();
    expect(await auditLog.list({ since: 0 })).toEqual([]);
  });
});

describe('StoreUpload Cancel of a zip stored just as it came', () => {
  it('RF-159 deletes the snapshot of a zip stored just as the Cancel came', async () => {
    const { useCase, project, uploads, batches, projects } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    const release = hold(uploads);
    const state = await accepted(await useCase.execute(request(project)));

    await batches.cancel({ actor: amy, projectId: project.id, batchId: state.batchId });
    release();
    await settle();

    expect(uploads.removed).toEqual([uploadSnapshotKey(project.id, uploads.hash)]);
    expect((await projects.find(amy.userId, project.id))?.upload).toBeUndefined();
  });

  it('RF-159, DEC-188 a Cancel after the end answers with the state and keeps the source', async () => {
    const { useCase, project, uploads, batches, projects } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    const state = await accepted(await useCase.execute(request(project)));
    await settle();

    const cancelled = await batches.cancel({
      ...{ actor: amy, projectId: project.id, batchId: state.batchId },
    });

    expect(cancelled.ok && cancelled.value).toMatchObject({
      cancelled: false,
      state: { phase: 'stored' },
    });
    expect((await projects.find(amy.userId, project.id))?.upload?.workbooks).toBe(1);
    expect(uploads.removed).toEqual([]);
  });
});

describe('StoreUpload the batch of a zip belongs to its owner', () => {
  it('RF-1105 answers not found to another user for the state, the current batch and the Cancel', async () => {
    const { useCase, project, uploads, batches } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    const release = hold(uploads);
    const state = await accepted(await useCase.execute(request(project)));
    const stranger = { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' } as const;
    const target = { actor: stranger, projectId: project.id, batchId: state.batchId };

    const answers = [
      await batches.state(target),
      await batches.current({ actor: stranger, projectId: project.id }),
      await batches.cancel(target),
    ];
    release();

    expect(answers).toEqual(Array(3).fill({ ok: false, error: ERROR_CODES.notFound }));
  });
});

describe('StoreUpload a zip that holds no workbook', () => {
  it('RF-128 is stored inside the request and answers with its summary, as before', async () => {
    const { useCase, project, uploads, batches } = await setup();

    const outcome = await useCase.execute(request(project));

    expect(outcome.ok && 'accepted' in outcome.value).toBe(false);
    expect(outcome.ok && outcome.value).toMatchObject({ files: 7, snapshotHash: uploads.hash });
    expect((await batches.current({ actor: amy, projectId: project.id })).ok).toBe(false);
  });

  it('RF-159 forgets the outcome of an earlier zip, which no longer describes the source', async () => {
    const { useCase, project, uploads, batches } = await setup();
    uploads.held = held();
    uploads.announcesWorkbooks = true;
    await accepted(await useCase.execute(request(project)));
    await settle();
    uploads.held = undefined;
    uploads.announcesWorkbooks = false;

    await useCase.execute(request(project));

    expect((await batches.current({ actor: amy, projectId: project.id })).ok).toBe(false);
  });
});
