import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { customerCard, planCards, planQuestions } from '../../support/plan-cards.js';

// RF-623, EV-31, P3-115: a data model answer with repeated columns (recorded Invoice plan) goes
// through BuildPlan; the repeated columns are not in data-model.md and checks.md lists them under
// "Left out" > "Data model".

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');
const answerPath = join('tests', 'fixtures', 'planner', 'data-model-invoice-repeated.json');
let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-placeholders-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: placeholder and repeated columns', () => {
  it('RF-623 the dropped columns are not in data-model.md and are listed in checks.md', async () => {
    const base = await loadRecording(recordingPath);
    const [first, second, third] = base.calls;
    const attempt = third?.attempts[0];
    if (first === undefined || second === undefined || attempt === undefined) throw new Error('x');
    if (!('response' in attempt)) throw new Error('The recording has three calls');
    const text = await readFile(answerPath, 'utf8');
    const calls = [first, second, { attempts: [{ response: { ...attempt.response, text } }] }];
    const h = await createPlanHarness(dataDir, { ...base, calls }, {});
    await h.understandRun({ cards: [...planCards(), customerCard()], questions: planQuestions });
    await h.saveBrief({
      architecture: { style: 'hexagonal' },
      migration: 'parallel-change',
      stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
    });

    const files = await h.handoffOf(await h.plan());

    const model = (files['data-model.md'] ?? '').replaceAll(String.fromCharCode(92), '');
    expect(model).toContain('invoice_date');
    expect(model).not.toContain('invoice_date_2');
    const checks = files['checks.md'] ?? '';
    expect(checks).toContain('### Data model');
    expect(checks).toContain(String.raw`- invoice\_date\_2:`);
    expect(checks).toContain(String.raw`- status\_2:`);
  });
});
