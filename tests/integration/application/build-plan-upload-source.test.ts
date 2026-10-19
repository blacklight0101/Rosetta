import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';

// RF-131, RF-604: a plan run over an understand run of an uploaded zip writes a package whose header
// names the zip from the manifest of that run (its name, its upload date and its hash).

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-upload-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

it('RF-131 writes the zip, the upload date and the hash in the README of the package', async () => {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const h = await createPlanHarness(dataDir, recording, {
    project: { sourceKind: 'upload', sourceUrl: '', ref: '', subpath: '' },
  });
  const upload = { fileName: 'OrderDesk.zip', uploadedAt: '2026-10-19T09:30:00.000Z' };
  const source = await h.understandRun({ cards: planCards(), questions: planQuestions, upload });
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
    `the uploaded zip OrderDesk.zip (uploaded 2026-10-19T09:30:00.000Z, snapshot sha256:${'cd'.repeat(32)})`,
  );
  expect(readme).not.toContain('github.com');
});
