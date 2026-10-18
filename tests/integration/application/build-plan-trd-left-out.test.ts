import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';

// RF-602, RF-622: when the only items the planner's answer loses are technical ones (a control no
// supported card shows), the run still completes and the log names them.

const answer = {
  requirements: [{ title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] }],
  technical: {
    security: [
      {
        name: 'Made up',
        approach: 'other',
        description: 'Nothing shows it.',
        sources: ['XYZ-999'],
      },
    ],
  },
};

let dataDir: string;
let h: PlanHarness;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-trd-left-'));
  const usage = {
    inputTokens: 10,
    outputTokens: 10,
    cachedInputTokens: 0,
    usageSource: 'reported',
  } as const;
  const prd = await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json'));
  const plan = recordingOf({
    retried: [],
    response: {
      text: JSON.stringify(answer),
      toolCalls: [],
      usage,
      finishReason: 'stop',
    },
  });
  h = await createPlanHarness(dataDir, { ...plan, calls: [...plan.calls, ...prd.calls.slice(1)] });
  await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.saveBrief({ architecture: { style: 'hexagonal' } });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: a technical item left out', () => {
  it('RF-602 RF-622 logs the item and writes a trd.md without it', async () => {
    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const warnings = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warnings.map((entry) => entry.message).join(' ')).toContain('1 technical item(s)');
    const trd = (await h.handoffOf(run))['trd.md'] ?? '';
    expect(trd).toContain('No security control was planned.');
  });
});
