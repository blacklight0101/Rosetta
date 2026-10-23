import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { customerCard, planCards, planQuestions } from '../../support/plan-cards.js';

// P3-120, RF-623, ADR-008: a plan run under SQL Server over the recorded planner answer (which
// uses PostgreSQL types): the data model call is given the SQL Server type names and checks.md
// lists the types that do not belong to the database.

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');
const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'SQL Server', custom: true }],
} as const;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-model-db-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: the data model and the chosen database', () => {
  it('RF-623 under SQL Server a PostgreSQL type of the planner answer is listed in checks.md', async () => {
    const h = await createPlanHarness(dataDir, await loadRecording(recordingPath));
    await h.understandRun({ cards: [...planCards(), customerCard()], questions: planQuestions });
    await h.saveBrief({
      ...briefAnswers,
      stack: [{ layer: 'database', choice: 'SQL Server', custom: true }],
    });

    const files = await h.handoffOf(await h.plan());

    const checks = (files['checks.md'] ?? '').replaceAll(String.fromCharCode(92), '');
    expect(checks).toContain('### Data model');
    expect(checks).toContain('is not a SQL Server type');
    const request = h.providers.requests()[2];
    expect(request?.messages.map((each) => each.content).join(' ')).toContain('uniqueidentifier');
  });
});
