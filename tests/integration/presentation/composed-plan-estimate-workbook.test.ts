import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scopeOf } from '../../../src/application/runs/run-scope.js';
import { actorOf } from '../../../src/domain/accounts/actor.js';
import { buildBrief } from '../../../src/domain/planning/planning-brief.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { FileCardOutputs } from '../../../src/infrastructure/cards/file-card-outputs.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { FilePlanningBriefStore } from '../../../src/infrastructure/files/file-planning-brief-store.js';
import { NodeOutputWriter } from '../../../src/infrastructure/files/node-output-writer.js';
import { SnapshotStore } from '../../../src/infrastructure/github/snapshot-store.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { composeProjects } from '../../../src/presentation/compose-projects.js';
import { sampleAccount } from '../../support/account-fixtures.js';
import { cardSource } from '../../support/card-fixtures.js';
import { estimatePrices } from '../../support/estimate-harness.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { shippedCatalogue } from '../../support/planning-brief-harness.js';
import { plannerSettings } from '../../support/plan-estimate-harness.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { sampleRun } from '../../support/run-fixtures.js';
import { removeWritableTree } from '../../support/writable-temp-root.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';
import { UPLOAD_HASH, UPLOAD_KEY, UPLOADED_AT } from '../../support/upload-run-fixtures.js';
import { workbookCards } from '../../support/workbook-plan-cards.js';

// RF-155, RF-613: the plan estimate of the composed projects services (`composeProjects`, the real
// scan results over a real snapshot folder) counts the planner's workbook guidance for an upload
// project whose snapshot record lists a workbook folder, and changes nothing for a GitHub project or
// for a zip that lists none. The use case has its own tests; only this one proves the wiring.

const folders: string[] = [];
afterAll(async () => {
  await Promise.all(folders.map((folder) => removeWritableTree(folder)));
});

const workbook = {
  fileName: 'Pricing.xlsx',
  folder: 'Pricing.xlsx',
  sizeBytes: 20480,
  sha256: `sha256:${'b'.repeat(64)}`,
  counts: { sheets: 2, nonEmptyCells: 20, formulas: 3, macroModules: 0, macrosSkipped: 0 },
};

const settings = plannerSettings({ provider: 'ollama', model: 'gemma4:e4b' });

type Pool = Awaited<ReturnType<ReturnType<typeof useTestDatabase>['createSchema']>>['pool'];

/** Writes the cards of an understand run and the saved brief under the data folder, as the app does. */
async function seedPlanSource(dataDir: string, run: Run): Promise<void> {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const writer = new NodeOutputWriter({ dataDir, logger });
  await new FileCardOutputs({ writer, masker, logger }).writeCards(scopeOf(run), {
    cards: workbookCards(),
    source: cardSource,
    areasWithoutCards: [],
  });
  const brief = { ...buildBrief({}, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  const ref = { userId: run.userId, projectId: run.projectId };
  await new FilePlanningBriefStore({ writer, masker }).write(ref, brief);
}

/** The prompt tokens the composed plan estimate counts for a project that has this understand run. */
async function promptTokens(pool: Pool, dataDir: string, ids: readonly string[]): Promise<number> {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const services = await composeProjects({
    ...{ pool, logger, clock, masker, dataDir },
    ...{ templatesFolder: 'templates', promptsFolder: 'prompts' },
    ...{ uploadMaxMb: 10, priceTable: estimatePrices, serverKeys: { has: () => true } },
    workbook: { workbookMaxFiles: 20, workbookMaxSheets: 200, workbookMaxCells: 2_000_000 },
  });
  const [userId, projectId] = ids;
  const outcome = await services.estimatePlan.execute({
    actor: actorOf(sampleAccount({ id: userId ?? '' })),
    projectId: projectId ?? '',
  });
  if (!outcome.ok) throw new Error(`The plan estimate was refused: ${outcome.error}`);
  return outcome.value.assumptions.promptTokens;
}

/** An upload project that scanned the pricing-workbook fixture, its record listing these workbooks. */
async function uploadEstimate(pool: Pool, workbooks: readonly (typeof workbook)[]) {
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-composed-estimate-'));
  folders.push(dataDir);
  const snapshot = new SnapshotStore(dataDir);
  const files = snapshot.filesDir(UPLOAD_KEY);
  await cp(join('tests', 'fixtures', 'repos', 'pricing-workbook'), files, { recursive: true });
  const h = await createUnderstandHarness({
    ...{ dataDir, repository: files, upload: true, settings },
    recording: 'understand-read-then-answer.json',
  });
  const scan = await h.scan();
  const record = {
    ...{ schemaVersion: 1, kind: 'upload', fileName: 'OrderDesk.zip', uploadedAt: UPLOADED_AT },
    ...(workbooks.length === 0 ? {} : { workbooks }),
    ...{ fileCount: 10, totalBytes: 4096, skippedLinks: 0, snapshotHash: UPLOAD_HASH },
  };
  await writeFile(join(snapshot.snapshotDir(UPLOAD_KEY), 'snapshot.json'), JSON.stringify(record));
  const owner = sampleAccount({ id: h.project.userId });
  await new PgUserRepository(pool).insert(owner);
  await new PgProjectRepository(pool).insertOrFind(h.project);
  const runs = new PgRunIndex(pool);
  await runs.insert(scan);
  const understand = sampleRun({
    ...{ userId: owner.id, projectId: h.project.id, stage: 'understand' },
    ...{ runKey: '20261012-090000-understand', queueState: 'Ended', endState: 'Completed' },
    ...{ commitSha: null, snapshotKey: UPLOAD_KEY },
  });
  await runs.insert(understand);
  await seedPlanSource(dataDir, understand);
  return promptTokens(pool, dataDir, [owner.id, h.project.id]);
}

/** A GitHub project with the same cards and brief and no scan. */
async function githubEstimate(pool: Pool) {
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-composed-estimate-'));
  folders.push(dataDir);
  const owner = sampleAccount();
  await new PgUserRepository(pool).insert(owner);
  const project = sampleProject({ userId: owner.id, settings });
  await new PgProjectRepository(pool).insertOrFind(project);
  const understand = sampleRun({
    ...{ userId: owner.id, projectId: project.id, stage: 'understand' },
    ...{ runKey: '20261012-090000-understand', queueState: 'Ended', endState: 'Completed' },
  });
  await new PgRunIndex(pool).insert(understand);
  await seedPlanSource(dataDir, understand);
  return promptTokens(pool, dataDir, [owner.id, project.id]);
}

describe.skipIf(!hasTestDatabase)('the plan estimate of the composed projects services', () => {
  const database = useTestDatabase();

  it('RF-155 RF-613 counts the workbook guidance for a zip whose snapshot record lists a workbook', async () => {
    const [listed, unlisted] = await Promise.all([
      database.createSchema({ migrate: true }),
      database.createSchema({ migrate: true }),
    ]);

    const withWorkbook = await uploadEstimate(listed.pool, [workbook]);
    const without = await uploadEstimate(unlisted.pool, []);

    expect(withWorkbook - without).toBeGreaterThan(300);
  }, 60_000);

  it('RF-155 a GitHub project and a zip without workbooks are estimated alike', async () => {
    const [zip, github] = await Promise.all([
      database.createSchema({ migrate: true }),
      database.createSchema({ migrate: true }),
    ]);

    const fromZip = await uploadEstimate(zip.pool, []);
    const fromGithub = await githubEstimate(github.pool);

    expect(fromGithub).toBe(fromZip);
  }, 60_000);
});
