import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import {
  amy,
  batchCase,
  bob,
  fileRequest,
  finishAndWait,
  workbookProject,
  type BatchCase,
} from '../../../support/workbook-batch-harness.js';

// RF-150, RF-152, RF-157, RFC-005 section 4.2: finishing a batch publishes the snapshot of all its
// workbooks and records it as the project's source, or publishes nothing and frees the project.

async function withFiles(test: BatchCase, names: readonly string[]): Promise<string> {
  const opened = await test.useCase.open({ actor: amy, projectId: test.project.id });
  if (!opened.ok) throw new Error('open refused');
  for (const name of names) {
    await test.useCase.receive(fileRequest(test.project, opened.value.batchId, { fileName: name }));
  }
  return opened.value.batchId;
}

function finishRequest(test: BatchCase, batchId: string, actor: Actor = amy) {
  return {
    ...{ actor, projectId: test.project.id, batchId, ip: '203.0.113.7' },
  };
}

describe('WorkbookBatches.finish', () => {
  it('RF-150 publishes the snapshot and answers each workbook, the hash and the instant', async () => {
    const test = await batchCase();
    const batchId = await withFiles(test, ['Pricing.xlsx', 'Rates.xlsm']);

    const outcome = await finishAndWait(test, finishRequest(test, batchId));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.workbooks.map((book) => book.name)).toEqual([
      'Pricing.xlsx',
      'Rates.xlsm',
    ]);
    expect(outcome.value.workbooks[0]).toEqual({
      ...{ name: 'Pricing.xlsx', sheets: 2, cells: 30, formulas: 4, macroModules: 0 },
    });
    expect(outcome.value).toMatchObject({
      skipped: [],
      uploadedAt: '2026-10-19T08:30:00.000Z',
      codeChangedSinceLastRun: false,
    });
    expect(outcome.value.snapshotHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('RF-150 records the workbooks as the source of the project: names, count and key', async () => {
    const test = await batchCase();
    const batchId = await withFiles(test, ['Pricing.xlsx', 'Rates.xlsm']);

    await finishAndWait(test, finishRequest(test, batchId));

    const stored = await test.projects.find(amy.userId, test.project.id);
    expect(stored?.upload).toMatchObject({
      fileName: 'Pricing.xlsx, Rates.xlsm',
      uploadedAt: Date.parse('2026-10-19T08:30:00.000Z'),
      workbooks: 2,
    });
    expect(stored?.upload?.snapshotKey).toMatch(/^workbook__[0-9a-f-]{36}@[0-9a-f]{16}$/u);
  });
});

describe('WorkbookBatches.finish (2)', () => {
  it('RF-157 writes an audit row for each workbook: name, size and hash, never content', async () => {
    const test = await batchCase();
    const batchId = await withFiles(test, ['Pricing.xlsx', 'Rates.xlsm']);

    await finishAndWait(test, finishRequest(test, batchId));

    const rows = await test.auditLog.list({ since: 0 });
    const uploaded = rows.filter((row) => row.action === 'source.workbook.uploaded');
    expect(uploaded.map((row) => row.detail['fileName']).sort()).toEqual([
      'Pricing.xlsx',
      'Rates.xlsm',
    ]);
    for (const row of uploaded) {
      expect(row).toMatchObject({
        actorUserId: amy.userId,
        targetType: 'project',
        targetId: test.project.id,
        ip: '203.0.113.7',
        outcome: 'ok',
      });
      expect(Object.keys(row.detail).sort()).toEqual([
        'fileName',
        'sha256',
        'size',
        'snapshotHash',
      ]);
    }
  });

  it('RF-150 ends the batch: a file after the finish and a second finish are not found', async () => {
    const test = await batchCase();
    const batchId = await withFiles(test, ['Pricing.xlsx']);
    await finishAndWait(test, finishRequest(test, batchId));

    const file = await test.useCase.receive(fileRequest(test.project, batchId));
    const again = await finishAndWait(test, finishRequest(test, batchId));
    const reopened = await test.useCase.open({ actor: amy, projectId: test.project.id });

    expect(file).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(again).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(reopened.ok).toBe(true);
  });
});

describe('WorkbookBatches.finish (3)', () => {
  it('RF-150 refuses a finish with no file with RST-2000 and keeps the batch open', async () => {
    const test = await batchCase();
    const batchId = await withFiles(test, []);

    const outcome = await finishAndWait(test, finishRequest(test, batchId));
    const file = await test.useCase.receive(fileRequest(test.project, batchId));

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
    expect(test.staging.published).toEqual([]);
    expect(file.ok).toBe(true);
    expect((await test.projects.find(amy.userId, test.project.id))?.upload).toBeUndefined();
  });

  it("RF-1105 answers not found for another user's batch and leaves the batch alone", async () => {
    const test = await batchCase();
    const batchId = await withFiles(test, ['Pricing.xlsx']);

    const foreign = await finishAndWait(test, finishRequest(test, batchId, bob));

    expect(foreign).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(test.staging.published).toEqual([]);
  });
});

describe('WorkbookBatches.finish when a workbook is refused', () => {
  it('RF-150 publishes nothing, records no source, frees the project and throws the refusal', async () => {
    const test = await batchCase();
    const batchId = await withFiles(test, ['Pricing.xlsx']);
    test.staging.publishFails = new RosettaError(ERROR_CODES.workbookEncrypted);

    await expect(finishAndWait(test, finishRequest(test, batchId))).rejects.toMatchObject({
      code: ERROR_CODES.workbookEncrypted,
    });

    expect((await test.projects.find(amy.userId, test.project.id))?.upload).toBeUndefined();
    expect(await test.auditLog.list({ since: 0 })).toEqual([]);
    expect(test.staging.discarded).toContain(batchId);
    const reopened = await test.useCase.open({ actor: amy, projectId: test.project.id });
    expect(reopened.ok).toBe(true);
  });

  it('RF-150 removes the snapshot when the project was deleted while the batch was read', async () => {
    const test = await batchCase();
    const batchId = await withFiles(test, ['Pricing.xlsx']);
    test.staging.duringPublish = () =>
      test.projects
        .remove(amy.userId, test.project.id, () => Promise.resolve())
        .then(() => undefined);

    const outcome = await finishAndWait(test, finishRequest(test, batchId));

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(test.uploads.removed).toHaveLength(1);
  });
});

describe('WorkbookBatches.finish when the source is uploaded again', () => {
  it('RF-150 keeps the earlier snapshot while a run uses it and deletes it otherwise', async () => {
    const test = await batchCase(workbookProject());
    const first = await withFiles(test, ['Pricing.xlsx']);
    await finishAndWait(test, finishRequest(test, first));
    const earlier = (await test.projects.find(amy.userId, test.project.id))?.upload?.snapshotKey;

    const second = await withFiles(test, ['Costs.xlsx']);
    const outcome = await finishAndWait(test, finishRequest(test, second));

    expect(outcome.ok).toBe(true);
    expect(test.uploads.removed).toEqual([earlier]);
  });

  it('RF-150 says the code changed since the last run when the newest run read another snapshot', async () => {
    const test = await batchCase();
    const first = await withFiles(test, ['Pricing.xlsx']);
    await finishAndWait(test, finishRequest(test, first));
    const key = (await test.projects.find(amy.userId, test.project.id))?.upload?.snapshotKey ?? '';
    await test.runs.insert(
      sampleRun({
        ...{ projectId: test.project.id, userId: amy.userId, snapshotKey: key },
        ...{ queueState: 'Ended', endState: 'Completed' },
      }),
    );
    test.projects.followRuns(test.runs);

    const second = await withFiles(test, ['Costs.xlsx']);
    const outcome = await finishAndWait(test, finishRequest(test, second));

    expect(outcome.ok && outcome.value.codeChangedSinceLastRun).toBe(true);
    expect(test.uploads.removed).toEqual([]);
  });
});
