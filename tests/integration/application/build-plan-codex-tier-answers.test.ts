import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards } from '../../support/plan-cards.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { plain } from '../../support/plan-method-harness.js';

// RF-639, RF-645, DEC-178, P7-12, EV-64, EV-77: a Codex brief that leaves the tier models blank gets
// the offered names in the package, and open-questions.md lists suggested answers for each blank
// tier question, like every other defaulted brief question.

let dataDir: string;
let h: PlanHarness;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-codex-tiers-'));
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  h = await createPlanHarness(dataDir, recording);
  await h.understandRun({ cards: planCards(), questions: [] });
  await h.saveBrief({ buildMethod: { aiAssisted: true, agentTool: { kind: 'codex' } } });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

/** The lines under one brief question of open-questions.md, up to the next question. */
function sectionOf(text: string, id: string): string {
  const [, after = ''] = text.split(`(${id})`);
  return after.split('\n- ')[0] ?? '';
}

describe('BuildPlan: a Codex brief with blank tier models', () => {
  it('RF-645 lists at least three suggested answers for each blank tier question', async () => {
    const files = await h.handoffOf(await h.plan());
    const text = plain(files['open-questions.md']);

    for (const tier of ['smallest', 'middle', 'largest']) {
      const section = sectionOf(text, `buildMethod.models.${tier}`);
      const numbered = section.match(/^\s*\d+\. /gmu) ?? [];

      expect(numbered.length).toBeGreaterThanOrEqual(3);
      expect(section).toMatch(/1\. .*\(Recommended\)/u);
    }
  });

  it('RF-639 the band table names a model for every tier, so checks.md lists no unnamed tier', async () => {
    const files = await h.handoffOf(await h.plan());

    expect(files['orchestration.md']).not.toContain('not named');
    expect(files['checks.md'] ?? '').not.toContain('no model is named');
  });
});
