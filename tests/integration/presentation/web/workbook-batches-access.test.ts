import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { idOf } from '../../../support/upload-route-harness.js';
import { sampleBook } from '../../../support/workbook-staging-harness.js';
import {
  batchesUrl,
  cancelBatch,
  createWorkbookProject,
  finishBatch,
  openBatch,
  putFile,
  useWorkbookServers,
} from '../../../support/workbook-route-harness.js';
import { testPublicUrl } from '../../../support/web-server.js';

// RF-1009, RF-1105, RF-157: who may call the batch routes, the batch of another project, two
// batches at once, and what the audit trail keeps of a finished batch.

const setup = useWorkbookServers();
const foreign = 'https://evil.example';

describe('the batch routes who may call them', () => {
  it('RF-1009 without a session every batch route answers 401 and opens nothing', async () => {
    const { test, amy, staging } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);
    const headers = { origin: testPublicUrl };
    const base = batchesUrl(projectId);

    const answers = await Promise.all([
      test.server.inject({ method: 'POST', url: base, headers }),
      test.server.inject({
        method: 'PUT',
        url: `${base}/${batchId}/files`,
        payload: Buffer.from('PK'),
        headers: { ...headers, 'content-type': 'application/octet-stream' },
      }),
      test.server.inject({ method: 'POST', url: `${base}/${batchId}/finish`, headers }),
      test.server.inject({ method: 'DELETE', url: `${base}/${batchId}`, headers }),
    ]);

    expect(answers.map((answer) => answer.statusCode)).toEqual([401, 401, 401, 401]);
    await staging.discard(batchId);
  });
});

describe('the batch routes who may call them (2)', () => {
  it('RF-1009 without the CSRF token every batch route answers 403 RST-2008 and changes nothing', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);
    const target = { projectId, batchId };
    const bytes = await sampleBook();

    const answers = [
      await amy.request({ method: 'POST', url: batchesUrl(projectId), csrf: false }),
      await putFile(amy, target, { name: 'Pricing.xlsx', bytes }, { csrf: false }),
      await finishBatch(amy, target, { csrf: false }),
      await amy.request({
        method: 'DELETE',
        url: `${batchesUrl(projectId)}/${batchId}`,
        csrf: false,
      }),
    ];

    for (const answer of answers) {
      expect(answer.statusCode).toBe(403);
      expect(answer.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
    }
    const stillOpen = await putFile(amy, target, { name: 'Pricing.xlsx', bytes });
    expect(stillOpen.statusCode).toBe(201);
  });
});

describe('the batch routes who may call them (3)', () => {
  it('RF-1009 from a foreign Origin every batch route answers 403 RST-2007 and changes nothing', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);
    const target = { projectId, batchId };
    const bytes = await sampleBook();

    const answers = [
      await amy.request({ method: 'POST', url: batchesUrl(projectId), origin: foreign }),
      await putFile(amy, target, { name: 'Pricing.xlsx', bytes }, { origin: foreign }),
      await finishBatch(amy, target, { origin: foreign }),
      await amy.request({
        method: 'DELETE',
        url: `${batchesUrl(projectId)}/${batchId}`,
        origin: foreign,
      }),
    ];

    for (const answer of answers) {
      expect(answer.statusCode).toBe(403);
      expect(answer.json()).toMatchObject({ code: ERROR_CODES.originRefused });
    }
    expect((await putFile(amy, target, { name: 'Pricing.xlsx', bytes })).statusCode).toBe(201);
  });

  it("RF-1105 another user's project answers 404 on every batch route", async () => {
    const { amy, bob } = await setup();
    const projectId = await createWorkbookProject(amy);
    const batchId = await openBatch(amy, projectId);
    const target = { projectId, batchId };

    const answers = [
      await bob.request({ method: 'POST', url: batchesUrl(projectId) }),
      await putFile(bob, target, { name: 'Pricing.xlsx', bytes: await sampleBook() }),
      await finishBatch(bob, target),
      await cancelBatch(bob, target),
    ];

    for (const answer of answers) {
      expect(answer.statusCode).toBe(404);
      expect(answer.json()).toMatchObject({ code: ERROR_CODES.notFound });
    }
    expect((await finishBatch(amy, target)).statusCode).toBe(400);
  });
});

describe('the batch routes and the batches of one user', () => {
  it('RF-1105 a batch id of another project answers 404 and touches neither project', async () => {
    const { amy } = await setup();
    const first = await createWorkbookProject(amy, 'First');
    const second = await createWorkbookProject(amy, 'Second');
    const firstBatch = await openBatch(amy, first);
    const secondBatch = await openBatch(amy, second);
    const bytes = await sampleBook();

    const file = await putFile(
      amy,
      { projectId: second, batchId: firstBatch },
      { name: 'Pricing.xlsx', bytes },
    );
    const finish = await finishBatch(amy, { projectId: second, batchId: firstBatch });
    const cancel = await cancelBatch(amy, { projectId: first, batchId: secondBatch });

    for (const answer of [file, finish, cancel]) expect(answer.statusCode).toBe(404);
    expect(
      (await putFile(amy, { projectId: first, batchId: firstBatch }, { name: 'A.xlsx', bytes }))
        .statusCode,
    ).toBe(201);
  });

  it('RF-150 two batches at once on one project: the second is refused, two projects each have one', async () => {
    const { amy } = await setup();
    const first = await createWorkbookProject(amy, 'First');
    const second = await createWorkbookProject(amy, 'Second');

    const answers = await Promise.all([
      amy.request({ method: 'POST', url: batchesUrl(first) }),
      amy.request({ method: 'POST', url: batchesUrl(first) }),
      amy.request({ method: 'POST', url: batchesUrl(second) }),
    ]);

    expect(answers.map((answer) => answer.statusCode).sort()).toEqual([201, 201, 409]);
  });
});

describe('the batch routes and the batches of one user (2)', () => {
  it('RF-150 a GitHub project and a zip project take no batch: 409', async () => {
    const { amy } = await setup();
    const github = idOf(
      await amy.request({
        method: 'POST',
        url: '/api/projects',
        payload: { url: 'https://github.com/owner/repo' },
      }),
    );
    const zip = idOf(
      await amy.request({
        method: 'POST',
        url: '/api/projects',
        payload: { sourceKind: 'upload', name: 'OrderDesk' },
      }),
    );

    for (const projectId of [github, zip]) {
      const response = await amy.request({ method: 'POST', url: batchesUrl(projectId) });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.conflict });
    }
  });
});

describe('the batch routes and the audit trail', () => {
  it('RF-157 keeps the name, size and hash of each workbook, and never its content', async () => {
    const { amy, test } = await setup();
    const projectId = await createWorkbookProject(amy);
    const target = { projectId, batchId: await openBatch(amy, projectId) };
    const bytes = await sampleBook();
    await putFile(amy, target, { name: 'Pricing.xlsx', bytes });

    await finishBatch(amy, target);

    const rows = await test.audit.list({ since: 0 });
    const row = rows.find((entry) => entry.action === 'source.workbook.uploaded');
    expect(row?.detail).toMatchObject({
      fileName: 'Pricing.xlsx',
      size: bytes.length,
    });
    expect(row?.detail['sha256']).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(JSON.stringify(rows)).not.toContain('Quantity');
  });
});
