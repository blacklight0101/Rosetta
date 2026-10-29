import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards } from '../../support/plan-cards.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { plain } from '../../support/plan-method-harness.js';

// RF-637, RF-645, DEC-178: the suggested answers saved with an open question reach open-questions.md
// of the package, the recommended one first; a question saved before DEC-178 is listed as before.

let dataDir: string;
let h: PlanHarness;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-suggested-'));
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  h = await createPlanHarness(dataDir, recording);
  await h.understandRun({
    cards: planCards(),
    questions: [
      {
        cardId: 'OQ-001',
        question: 'Which roles may cancel a paid order?',
        options: [
          { answer: 'Only the owner', description: 'Safest.', recommended: true },
          { answer: 'Any staff member', description: 'Fastest.', recommended: false },
          { answer: 'Staff with approval', description: 'A middle way.', recommended: false },
        ],
      },
      { cardId: 'OQ-002', question: 'Does a cancelled order refund the customer on its own?' },
    ],
  });
  await h.saveBrief({ buildMethod: { aiAssisted: true } });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: suggested answers in the package', () => {
  it('RF-637 RF-645 a question saved with suggested answers lists them, the recommended one first', async () => {
    const files = await h.handoffOf(await h.plan());

    const text = plain(files['open-questions.md']);
    expect(text).toContain('1. Only the owner (Recommended) - Safest.');
    expect(text).toContain('2. Any staff member - Fastest.');
    expect(text).toContain('may answer otherwise');
  });

  it('RF-645 a question saved without suggested answers is listed as before', async () => {
    const files = await h.handoffOf(await h.plan());

    const text = plain(files['open-questions.md']);
    const [, second = ''] = text.split('- OQ-002:');
    const [own = ''] = second.split('## Claims left out');
    expect(own).not.toContain('Recommended');
    expect(own).not.toContain('Suggested answers');
  });
});
