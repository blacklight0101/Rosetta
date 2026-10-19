import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';

// RF-156, RF-604: a plan run over an understand run of Excel workbooks writes a package whose header
// names the workbooks from the manifest of that run (their names, the upload date and the hash).

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-workbook-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

it('RF-156 writes the workbooks, the upload date and the hash in the README of the package', async () => {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const h = await createPlanHarness(dataDir, recording, {
    project: { sourceKind: 'workbook', sourceUrl: '', ref: '', subpath: '' },
  });
  const workbooks = {
    names: ['Pricing.xlsx', 'Rates.xlsm'],
    uploadedAt: '2026-10-19T09:30:00.000Z',
  };
  const source = await h.understandRun({ cards: planCards(), questions: planQuestions, workbooks });
  await h.answer(source, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief({
    architecture: { style: 'hexagonal' },
    migration: 'parallel-change',
    stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
  });

  const run = await h.plan();

  expect(run.endState).toBe('Completed');
  const files = await h.handoffOf(run);
  const readme = (files['README.md'] ?? '').replaceAll('\\', '');
  expect(readme).toContain(
    `the Excel workbooks Pricing.xlsx and Rates.xlsm (uploaded 2026-10-19T09:30:00.000Z, snapshot sha256:${'cd'.repeat(32)})`,
  );
  expect(readme).not.toContain('github.com');
  expect(readme).not.toContain('uploaded zip');
});
