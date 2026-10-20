import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  amy,
  batchCase,
  bob,
  bodyOf,
  fileRequest,
  limitBytes,
  workbookProject,
} from '../../../support/workbook-batch-harness.js';

// RF-150, RF-129: one workbook goes into an open batch: its name, the part of the total still free,
// the owner's scope and what a failed file leaves behind.

const OTHER_ID = '00000000-0000-4000-a000-0000000000f1';

async function opened(test: Awaited<ReturnType<typeof batchCase>>): Promise<string> {
  const outcome = await test.useCase.open({ actor: amy, projectId: test.project.id });
  if (!outcome.ok) throw new Error(`open refused: ${outcome.error}`);
  return outcome.value.batchId;
}

describe('WorkbookBatches.receive', () => {
  it('RF-150 stores the file and answers its name and size', async () => {
    const test = await batchCase();
    const batchId = await opened(test);

    const outcome = await test.useCase.receive(fileRequest(test.project, batchId));

    expect(outcome).toEqual({ ok: true, value: { name: 'Pricing.xlsx', size: 100 } });
  });

  it('RF-150 decodes the percent-encoded name and keeps only its base name', async () => {
    const test = await batchCase();
    const batchId = await opened(test);

    await test.useCase.receive(
      fileRequest(test.project, batchId, {
        fileName: encodeURIComponent('C:\\Users\\Ana\\Caf\u00e9 Costs.xlsm'),
      }),
    );

    expect(test.staging.received[0]?.fileName).toBe('Caf\u00e9 Costs.xlsm');
  });

  it('RF-150 refuses a request without a name with RST-2000 and a bad encoding with RST-1930', async () => {
    const test = await batchCase();
    const batchId = await opened(test);

    const missing = await test.useCase.receive(
      fileRequest(test.project, batchId, { fileName: undefined }),
    );
    const broken = await test.useCase.receive(
      fileRequest(test.project, batchId, { fileName: '%E0%A4%A' }),
    );

    expect(missing).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
    expect(broken).toEqual({ ok: false, error: ERROR_CODES.uploadNameUnreadable });
    expect(test.staging.received).toEqual([]);
  });
});

describe('WorkbookBatches.receive (2)', () => {
  it('RF-129 gives each file the part of the total that is still free', async () => {
    const test = await batchCase();
    const batchId = await opened(test);

    for (const name of ['One.xlsx', 'Two.xlsx', 'Three.xlsx']) {
      await test.useCase.receive(fileRequest(test.project, batchId, { fileName: name }));
    }

    expect(test.staging.received.map((r) => r.limitBytes)).toEqual([
      limitBytes,
      limitBytes - 100,
      limitBytes - 200,
    ]);
  });

  it('RF-129 does not count the bytes of a file that failed', async () => {
    const test = await batchCase();
    const batchId = await opened(test);
    test.staging.receiveFails = new RosettaError(ERROR_CODES.uploadTooLarge);

    await expect(test.useCase.receive(fileRequest(test.project, batchId))).rejects.toMatchObject({
      code: ERROR_CODES.uploadTooLarge,
    });
    test.staging.receiveFails = undefined;
    await test.useCase.receive(fileRequest(test.project, batchId, { fileName: 'Two.xlsx' }));

    expect(test.staging.received.map((r) => r.limitBytes)).toEqual([limitBytes, limitBytes]);
  });

  it('RF-150 keeps the batch open after a file failed, so the file can be sent again', async () => {
    const test = await batchCase();
    const batchId = await opened(test);
    test.staging.receiveFails = new RosettaError(ERROR_CODES.workbookDuplicateName);
    await expect(test.useCase.receive(fileRequest(test.project, batchId))).rejects.toBeInstanceOf(
      RosettaError,
    );
    test.staging.receiveFails = undefined;

    const again = await test.useCase.receive(fileRequest(test.project, batchId));

    expect(again.ok).toBe(true);
    expect(test.staging.discarded).toEqual([]);
  });
});

describe('WorkbookBatches.receive (3)', () => {
  it("RF-1105 answers not found for another user's batch, another project's batch and an unknown one", async () => {
    const test = await batchCase();
    const other = workbookProject({ id: OTHER_ID });
    await test.projects.insertOrFind(other);
    const batchId = await opened(test);

    const foreign = await test.useCase.receive(fileRequest(test.project, batchId, { actor: bob }));
    const wrongProject = await test.useCase.receive(fileRequest(other, batchId));
    const unknown = await test.useCase.receive(fileRequest(test.project, 'no-such-batch'));

    for (const outcome of [foreign, wrongProject, unknown]) {
      expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    }
    expect(test.staging.received).toEqual([]);
  });

  it('RF-150 refuses a second file while the first is still arriving with RST-1919', async () => {
    const test = await batchCase();
    const batchId = await opened(test);
    let release: () => void = () => undefined;
    test.staging.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = test.useCase.receive(fileRequest(test.project, batchId));

    const second = await test.useCase.receive(
      fileRequest(test.project, batchId, { fileName: 'Two.xlsx', body: bodyOf(5) }),
    );
    release();
    await first;

    expect(second).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    expect(test.staging.received).toHaveLength(1);
  });
});

describe('WorkbookBatches.receive (4)', () => {
  it('RF-150 stops a file that is still arriving when the server shuts down', async () => {
    const test = await batchCase();
    const batchId = await opened(test);
    let release: () => void = () => undefined;
    test.staging.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const arriving = test.useCase.receive(fileRequest(test.project, batchId));
    await Promise.resolve();

    test.useCase.abortAll();
    release();
    await arriving;

    expect(test.staging.received[0]?.signal.aborted).toBe(true);
  });
});
