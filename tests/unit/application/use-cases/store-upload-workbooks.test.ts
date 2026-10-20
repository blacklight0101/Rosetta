import { describe, expect, it } from 'vitest';
import { amy, request, setup } from '../../../support/store-upload-harness.js';

// RF-152, RF-150, RF-157, Q-41: when the zip held workbooks, the summary says so, the project counts
// them and the audit trail has a row for each; a zip without any reads as before.

const counts = { sheets: 2, nonEmptyCells: 30, formulas: 4, macroModules: 0, macrosSkipped: 0 };
const entry = {
  fileName: 'docs/Pricing.xlsx',
  folder: 'docs/Pricing.xlsx',
  sizeBytes: 2048,
  sha256: `sha256:${'12'.repeat(32)}`,
  counts,
};
const line = { name: 'docs/Pricing.xlsx', sheets: 2, cells: 30, formulas: 4, macroModules: 0 };
const leftOut = { name: 'old/Legacy.xls', reason: 'RST-1921: a legacy format' };

describe('StoreUpload a zip that held workbooks', () => {
  it('RF-150 adds the workbooks and the ones left out to the summary', async () => {
    const { useCase, project, uploads } = await setup();
    uploads.held = { entries: [entry], lines: [line], leftOut: [leftOut] };

    const outcome = await useCase.execute(request(project));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.workbooks).toEqual([line]);
    expect(outcome.value.leftOut).toEqual([leftOut]);
  });

  it('RF-152 records the count of rendered workbooks on the project', async () => {
    const { useCase, project, projects, uploads } = await setup();
    uploads.held = { entries: [entry], lines: [line], leftOut: [] };

    await useCase.execute(request(project));

    expect((await projects.find(amy.userId, project.id))?.upload?.workbooks).toBe(1);
  });

  it('RF-157 writes the zip row and one row for the workbook, with name, size and hash only', async () => {
    const { useCase, project, auditLog, uploads } = await setup();
    uploads.held = { entries: [entry], lines: [line], leftOut: [] };

    await useCase.execute(request(project));

    const rows = await auditLog.list({ since: 0 });
    expect(rows.map((row) => row.action).sort()).toEqual([
      'source.uploaded',
      'source.workbook.uploaded',
    ]);
    const book = rows.find((row) => row.action === 'source.workbook.uploaded');
    expect(book?.detail).toEqual({
      fileName: 'docs/Pricing.xlsx',
      size: 2048,
      sha256: entry.sha256,
      snapshotHash: uploads.hash,
    });
  });
});

describe('StoreUpload a zip whose workbooks were all left out', () => {
  it('Q-41 lists them, and the project counts no workbook', async () => {
    const { useCase, project, projects, uploads, auditLog } = await setup();
    uploads.held = { entries: [], lines: [], leftOut: [leftOut] };

    const outcome = await useCase.execute(request(project));

    expect(outcome.ok && outcome.value.leftOut).toEqual([leftOut]);
    expect((await projects.find(amy.userId, project.id))?.upload?.workbooks).toBeUndefined();
    expect(await auditLog.list({ since: 0 })).toHaveLength(1);
  });
});

describe('StoreUpload a zip that held no workbook', () => {
  it('RF-128 adds nothing to the summary, the project or the audit trail', async () => {
    const { useCase, project, projects, auditLog } = await setup();

    const outcome = await useCase.execute(request(project));

    expect(outcome.ok && Object.keys(outcome.value)).not.toContain('workbooks');
    expect(outcome.ok && Object.keys(outcome.value)).not.toContain('leftOut');
    expect((await projects.find(amy.userId, project.id))?.upload).not.toHaveProperty('workbooks');
    expect(await auditLog.list({ since: 0 })).toHaveLength(1);
  });
});
