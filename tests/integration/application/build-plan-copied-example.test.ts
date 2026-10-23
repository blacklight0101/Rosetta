import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import type { Recording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';

// P3-117, EV-34: a planner answer that copies the example sentences of its prompts is flagged in
// checks.md. The recorded planner answer is the one of tests/recordings/fake/planner-package.json
// with the PRD (its second call) replaced by a synthetic one that repeats example sentences of the
// current and of older planner prompts word for word.

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-copied-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');

/** The recorded answers with the text of the second call (the PRD) replaced. */
async function withPrd(prd: object): Promise<Recording> {
  const recording = await loadRecording(recordingPath);
  const calls = recording.calls.map((call, index) =>
    index !== 1
      ? call
      : {
          attempts: call.attempts.map((attempt) =>
            'response' in attempt
              ? { response: { ...attempt.response, text: JSON.stringify(prd) } }
              : attempt,
          ),
        },
  );
  return { ...recording, calls };
}

async function checksOf(prd: object): Promise<string> {
  const h = await createPlanHarness(dataDir, await withPrd(prd));
  const run = await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.answer(run, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief({ architecture: { style: 'hexagonal' }, migration: 'parallel-change' });
  return (await h.handoffOf(await h.plan()))['checks.md'] ?? '';
}

describe('P3-117 a package that copies the example of a planner prompt', () => {
  it('P3-117 checks.md lists the PRD sentences that match an example of a prompt, old versions too', async () => {
    const checks = await checksOf({
      problem: {
        text: 'The order rules sit in several pages of the legacy shop.',
        sources: ['BR-001'],
      },
      outOfScope: [{ text: 'Automatic refunds.', sources: ['BR-001'] }],
      nonFunctional: [{ text: 'card numbers are NEVER stored', sources: ['BR-001'] }],
      rules: [{ text: 'Every order is audited.', sources: ['BR-001'] }],
    });

    expect(checks).toContain('## Copied from a prompt example');
    expect(checks).toContain(
      '- PRD, problem: The order rules sit in several pages of the legacy shop.',
    );
    expect(checks).toContain('- PRD, out of scope: Automatic refunds.');
    expect(checks).toContain('- PRD, non-functional: card numbers are NEVER stored');
    expect(checks).not.toContain('Every order is audited');
  });

  it('P3-117 a package of its own sentences has no such section', async () => {
    const checks = await checksOf({
      problem: { text: 'Nobody can tell which pages touch the stock.', sources: ['BR-001'] },
      rules: [{ text: 'Every order is audited.', sources: ['BR-001'] }],
    });

    expect(checks).not.toContain('Copied from a prompt example');
  });
});
