import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { EstimateRun } from '../../../src/application/estimate/estimate-run.js';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { estimateView } from '../../../src/presentation/web/estimate-view.js';
import {
  createEstimateHarness,
  estimatePrices,
  projectWithScan,
} from '../../support/estimate-harness.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { userAmy } from '../../support/run-harness.js';

// RF-425, RF-402, Q-58, P3-86: the estimate names the reasoning effort of a role whose model is a
// reasoning model (the project's setting, low when it has none); a role on any other model shows
// none, because none is sent to it.

const isReasoning = (kind: string, model: string): boolean =>
  kind === 'openai' && model === 'priced-model';

function settingsWithEffort(effort?: 'medium'): ProjectSettings {
  const base = settingsFor({
    reader: { provider: 'openai', model: 'priced-model' },
    verifier: { provider: 'ollama', model: 'gemma4:e4b' },
  });
  const reader = {
    ...base.roles.reader,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  };
  return { ...base, roles: { ...base.roles, reader } };
}

async function viewOf(settings: ProjectSettings, marked: boolean) {
  const h = createEstimateHarness();
  const estimate = new EstimateRun({
    ...{ projects: h.projects, runs: h.runs, scans: h.scans, keys: h.keys },
    priceTable: estimatePrices,
    reasoningModels: marked ? isReasoning : () => false,
  });
  const project = await projectWithScan(h, userAmy.userId, settings);
  const outcome = await estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error('The estimate was refused.');
  return estimateView(outcome.value);
}

const rolesSchema = z.array(z.record(z.string(), z.unknown()));

function rolesOf(view: Record<string, unknown>): Record<string, unknown>[] {
  return rolesSchema.parse(view['roles']);
}

describe('the estimate: reasoning effort', () => {
  it('RF-425 shows low for a reasoning model whose role sets no effort', async () => {
    const [reader] = rolesOf(await viewOf(settingsWithEffort(), true));

    expect(reader?.['reasoningEffort']).toBe('low');
  });

  it('RF-425 shows the effort the role sets', async () => {
    const [reader] = rolesOf(await viewOf(settingsWithEffort('medium'), true));

    expect(reader?.['reasoningEffort']).toBe('medium');
  });

  it('RF-425 shows none for a local model or a model the list does not mark', async () => {
    const marked = rolesOf(await viewOf(settingsWithEffort('medium'), true));
    const unmarked = rolesOf(await viewOf(settingsWithEffort('medium'), false));

    expect(marked[1]).not.toHaveProperty('reasoningEffort');
    expect(unmarked[0]).not.toHaveProperty('reasoningEffort');
  });
});
