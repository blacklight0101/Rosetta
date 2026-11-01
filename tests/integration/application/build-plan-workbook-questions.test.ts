import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';

// RF-648, RF-649, RF-650, DEC-150: a recorded plan over workbooks writes a package that names the
// sign-in and the secrets store, lists the skipped questions as open and has a screen set per table;
// the same plan over a repository is without all of it.

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-workbook-q-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function packageOf(sourceKind: 'workbook' | 'github') {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const h = await createPlanHarness(dataDir, recording, {
    project: {
      sourceKind,
      sourceUrl: sourceKind === 'github' ? 'https://github.com/octo/demo' : '',
      ref: '',
      subpath: '',
    },
  });
  const workbooks = { names: ['Sheet.xlsx'], uploadedAt: '2026-10-19T09:30:00.000Z' };
  const source = await h.understandRun({
    cards: planCards(),
    questions: planQuestions,
    ...(sourceKind === 'workbook' ? { workbooks } : {}),
  });
  await h.answer(source, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief({
    architecture: { style: 'hexagonal' },
    migration: 'parallel-change',
    stack: [{ layer: 'hosting', choice: 'IIS on Windows Server', custom: true }],
    chosen: { 'workbook.secrets': 'vault' },
  });
  const run = await h.plan();
  expect(run.endState).toBe('Completed');
  return h.handoffOf(run);
}

it('RF-648 RF-649 RF-650 a workbook package names the sign-in, the store and the screens per table', async () => {
  const files = await packageOf('workbook');

  const trd = files['trd.md'] ?? '';
  expect(trd).toContain('Sign-in: Windows authentication');
  expect(trd).toContain('Secrets store: A dedicated secrets manager');
  const decisions = Object.entries(files).filter(([path]) => path.startsWith('decisions/'));
  expect(decisions.some(([, text]) => text.includes('Sign-in: Windows authentication'))).toBe(true);
  expect(
    decisions.some(([, text]) => text.includes('Secrets store: A dedicated secrets manager')),
  ).toBe(true);
  const ux = files['ux/README.md'] ?? '';
  expect(ux).toContain('List customer');
  expect(ux).toContain('Edit customer_order');
  expect(files['flows/README.md']).toContain('Sign in with Windows authentication');
});

it('RF-648 RF-650 the questions that were skipped are listed in open-questions.md with their options', async () => {
  const open = (await packageOf('workbook'))['open-questions.md'] ?? '';

  expect(open).toContain('workbook.signIn');
  expect(open).toContain('workbook.screens');
  expect(open).not.toContain('workbook.secrets');
  expect(open).toContain('Single sign-on');
});

it('RF-648 a plan over a repository is without the questions, the records and the screen sets', async () => {
  const files = await packageOf('github');

  const everything = Object.values(files).join('\n');
  expect(everything).not.toContain('workbook.');
  expect(everything).not.toContain('Sign-in:');
  expect(everything).not.toContain('Secrets store:');
  expect(files['flows/README.md']).not.toContain('Sign in with');
});
