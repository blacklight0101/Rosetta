import { NO_LISTED_MODELS } from '../../../src/application/models/model-list.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { composeProjects } from '../../../src/presentation/compose-projects.js';
import { sampleAccount } from '../../support/account-fixtures.js';
import { estimatePrices } from '../../support/estimate-harness.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { sampleZip } from '../../support/upload-store-harness.js';
import { removeWritableTree } from '../../support/writable-temp-root.js';

// DEC-149, RF-129, RF-150: the projects services the composition root builds share one reservation of
// free space between the zip upload and the workbook batch, so a zip and a batch that start together
// cannot each pass the check against the same free bytes. Only the composed services prove the wiring.

const folders: string[] = [];
const owner = '00000000-0000-4000-9000-0000000000a1';
const MB = 1024 * 1024;

afterAll(async () => {
  await Promise.all(folders.map((folder) => removeWritableTree(folder)));
});

async function* oneZip(): AsyncGenerator<Uint8Array> {
  yield await sampleZip();
}

const database = useTestDatabase();

async function services(freeBytes: number) {
  const { pool } = await database.createSchema({ migrate: true });
  await new PgUserRepository(pool).insert(sampleAccount({ id: owner, userName: 'amy' }));
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-composed-space-'));
  folders.push(dataDir);
  const clock = new FixedClock('2026-10-19T08:30:00.000Z');
  const masker = new SecretMasker();
  const projects = await composeProjects({
    ...{ pool, clock, masker, dataDir, logger: new MemoryLogger(clock, masker) },
    ...{
      templatesFolder: 'templates',
      promptsFolder: 'prompts',
      priceTable: estimatePrices,
      models: NO_LISTED_MODELS,
    },
    ...{ uploadMaxMb: 1, serverKeys: { has: () => true } },
    workbook: { workbookMaxFiles: 5, workbookMaxSheets: 200, workbookMaxCells: 2_000_000 },
    freeBytes: () => Promise.resolve(freeBytes),
  });
  const repository = new PgProjectRepository(pool);
  const actor = { userId: owner, role: 'user' } as const;
  return { projects, repository, actor };
}

describe.skipIf(!hasTestDatabase)('the composed projects services and the free space', () => {
  it('DEC-149 a zip upload is refused for space while a workbook batch holds the room for one', async () => {
    const { projects, repository, actor } = await services(2 * MB + 1024);
    const zip = sampleProject({
      userId: owner,
      sourceKind: 'upload',
      sourceUrl: '',
      ref: '',
      subpath: '',
    });
    const book = sampleProject({
      userId: owner,
      sourceKind: 'workbook',
      sourceUrl: '',
      ref: '',
      subpath: '',
    });
    await repository.insertOrFind(zip);
    await repository.insertOrFind(book);
    const batch = await projects.workbookBatches.open({ actor, projectId: book.id });
    expect(batch.ok).toBe(true);

    await expect(
      projects.storeUpload.execute({
        ...{ actor, projectId: zip.id, fileName: 'OrderDesk.zip', body: oneZip() },
        ...{ declaredBytes: undefined, ip: '203.0.113.7', signal: new AbortController().signal },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.uploadNoSpace });
  });
});

describe.skipIf(!hasTestDatabase)('the composed projects services and the free space (2)', () => {
  it('DEC-149 a workbook batch is refused for space while a zip upload holds the room for one', async () => {
    const { projects, repository, actor } = await services(2 * MB + 1024);
    const zip = sampleProject({
      userId: owner,
      sourceKind: 'upload',
      sourceUrl: '',
      ref: '',
      subpath: '',
    });
    const book = sampleProject({
      userId: owner,
      sourceKind: 'workbook',
      sourceUrl: '',
      ref: '',
      subpath: '',
    });
    await repository.insertOrFind(zip);
    await repository.insertOrFind(book);
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const slow = (async function* () {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      yield await sampleZip();
    })();
    const running = projects.storeUpload.execute({
      ...{ actor, projectId: zip.id, fileName: 'OrderDesk.zip', body: slow },
      ...{ declaredBytes: undefined, ip: '203.0.113.7', signal: new AbortController().signal },
    });
    await reading;

    await expect(
      projects.workbookBatches.open({ actor, projectId: book.id }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.uploadNoSpace,
    });
    release();
    await running;
  });
});
