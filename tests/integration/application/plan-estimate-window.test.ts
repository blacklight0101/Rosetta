import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { largeCards } from '../../support/large-understand.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { withContextTokens } from '../../support/provider-factory-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// P3-113, EV-29, RF-613: the plan estimate of a large understand says whether the prompts fit the
// planner's window, names the window, and measures the prompts as the run will send them (packed).

const temp = useTempRoot('rosetta-plan-estimate-window-');

async function estimateWith(contextTokens: number, folder: string) {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const h = await createPlanHarness(join(temp.path, folder), recording, {
    settings: (settings: ProjectSettings) => withContextTokens(settings, 'fake', contextTokens),
  });
  await h.understandRun({ cards: largeCards() });
  await h.saveBrief({ migration: 'parallel-change' });
  return h.estimate();
}

describe('plan estimate against the planner window', () => {
  it('EV-29 measures the PRD prompt packed to a 131,072-token window and says it fits', async () => {
    const { assumptions } = await estimateWith(131_072, 'fits');

    expect(assumptions.windowTokens).toBe(131_072);
    expect(assumptions.prdPromptTokens).toBeLessThanOrEqual(
      131_072 - 2 * assumptions.maxOutputTokens,
    );
    expect(assumptions.omittedCards).toBeGreaterThan(0);
    expect(assumptions.fitsWindow).toBe(true);
    expect(assumptions.oversizedCalls).toEqual([]);
  });

  it('EV-29 measures the whole project when the window holds it', async () => {
    const { assumptions } = await estimateWith(1_000_000, 'roomy');

    expect(assumptions.omittedCards).toBe(0);
    expect(assumptions.prdPromptTokens).toBeGreaterThan(131_072);
    expect(assumptions.fitsWindow).toBe(true);
  });

  it('EV-29 flags a prompt that cannot fit and names the window', async () => {
    const { assumptions } = await estimateWith(40_000, 'small');

    expect(assumptions.windowTokens).toBe(40_000);
    expect(assumptions.fitsWindow).toBe(false);
    expect(assumptions.oversizedCalls).toContain('prd');
    expect(assumptions.oversizedCalls).toContain('plan');
  });
});
