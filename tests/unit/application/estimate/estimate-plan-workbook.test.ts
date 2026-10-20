import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { planCards } from '../../../support/plan-cards.js';
import {
  createPlanEstimateHarness,
  plannerSettings,
} from '../../../support/plan-estimate-harness.js';

// RF-155, RF-613: the plan estimate counts the workbook guidance in the package prompt of a
// workbook project, measured as the guard measures it, and nothing for a GitHub project.

async function promptTokens(project: Record<string, unknown>): Promise<number> {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    seed: { cards: planCards() },
    project,
  });
  const result = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value.assumptions.promptTokens;
}

describe('EstimatePlan: the workbook guidance', () => {
  it('RF-155 counts the guidance of the planner for a workbook project', async () => {
    const guidance = await readFile('prompts/planner/workbook.v1.md', 'utf8');

    const github = await promptTokens({});
    const workbook = await promptTokens({
      sourceKind: 'workbook',
      sourceUrl: '',
      ref: '',
      subpath: '',
    });

    expect(workbook - github).toBeGreaterThanOrEqual(Math.floor(guidance.trim().length / 4));
  });
});
