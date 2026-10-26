import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Project } from '../../../src/application/projects/project.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { invoiceRendered } from '../../support/invoice-formula-files.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { demoScan, FixtureScans, scanOf } from '../../support/scan-shape-fixtures.js';
import { workbookCards } from '../../support/workbook-plan-cards.js';

// RF-152, RF-155, RF-601, P3-94: a plan run over a workbook project writes `workbook-formulas.md`
// from the rendered workbook in its scan, by code and not by the model, and lists it in the
// README. A GitHub project, and a zip whose scan lists no workbook, get no such file. The planner
// replays tests/recordings/fake/planner-workbook.json; no real model is called.

const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  application: 'keep',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;

const workbookProject: Partial<Project> = {
  sourceKind: 'workbook',
  sourceUrl: '',
  ref: '',
  subpath: '',
};
const zipProject: Partial<Project> = { sourceKind: 'upload', sourceUrl: '', ref: '', subpath: '' };
const workbooks = { names: ['Invoice_Sample.xlsm'], uploadedAt: '2026-10-19T09:30:00.000Z' };
const FILE = 'workbook-formulas.md';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-formulas-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function planned(
  project: Partial<Project>,
  scans: FixtureScans | undefined,
  seed: 'workbook' | 'zip' | 'github',
) {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-workbook.json'),
  );
  const h = await createPlanHarness(dataDir, recording, {
    project,
    ...(scans === undefined ? {} : { scans }),
  });
  const upload = { fileName: 'Invoice.zip', uploadedAt: workbooks.uploadedAt };
  const source = await h.understandRun({
    cards: workbookCards(),
    ...(seed === 'workbook' ? { workbooks } : {}),
    ...(seed === 'zip' ? { upload } : {}),
  });
  await h.seedScan(seed === 'github' ? {} : { snapshotKey: source.snapshotKey });
  await h.saveBrief(briefAnswers);
  const run = await h.plan();
  expect(run.endState).toBe('Completed');
  return { h, files: await h.handoffOf(run) };
}

const invoiceScans = () => new FixtureScans(scanOf(invoiceRendered()), ['Invoice_Sample.xlsm']);

it('P3-94 writes workbook-formulas.md for a workbook project, from its rendered formulas', async () => {
  const { files } = await planned(workbookProject, invoiceScans(), 'workbook');

  const text = files[FILE] ?? '';
  expect(text).toContain('#### F-003');
  expect(text).toContain('- Table column: InvoiceTable, "Agreed Amount Total"');
  expect(text).toContain('- Formula: `[Amount Line 1]+[Amount Line 2]+[Amount Line 3]`');
});

it('RF-601 lists the file in the README of the package', async () => {
  const { files } = await planned(workbookProject, invoiceScans(), 'workbook');

  expect(files['README.md']).toContain('[Workbook formulas](workbook-formulas.md)');
});

it('P3-94 writes the file for a zip whose scan lists a rendered workbook', async () => {
  const { files } = await planned(zipProject, invoiceScans(), 'zip');

  expect(files[FILE]).toContain('#### F-009');
});

it('P3-94 never shows the planner the formulas: the file is written by code', async () => {
  const { h } = await planned(workbookProject, invoiceScans(), 'workbook');

  const sent = h.providers
    .requests()
    .flatMap((request) => [request.system, ...request.messages.map((message) => message.content)]);
  expect(sent.join('\n')).not.toContain('Agreed Amount Total');
});

it('P3-94 writes no file for a GitHub project, even when a scan of its snapshot lists folders', async () => {
  const scans = new FixtureScans(demoScan(), ['Invoice_Sample.xlsm']);

  const { files } = await planned({}, scans, 'github');

  expect(Object.keys(files)).not.toContain(FILE);
  expect(files['README.md']).not.toContain(FILE);
});

it('P3-94 writes no file for a zip whose scan lists no workbook', async () => {
  const { files } = await planned(zipProject, new FixtureScans(demoScan()), 'zip');

  expect(Object.keys(files)).not.toContain(FILE);
});

it('P3-94 writes no file for a zip whose scan is gone', async () => {
  const { files } = await planned(zipProject, undefined, 'zip');

  expect(Object.keys(files)).not.toContain(FILE);
});
