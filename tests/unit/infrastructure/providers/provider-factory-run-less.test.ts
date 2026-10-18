import { describe, expect, it } from 'vitest';
import type { ProviderRun } from '../../../../src/application/ports/provider-set-factory.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import {
  callFor,
  factoryHarness,
  settingsFor,
  testRun,
} from '../../../support/provider-factory-harness.js';

// ADR-007, RF-407, RF-608: a call that belongs to no run is not always a provider test. The options
// of Plan setup are asked of the planner for a project, at stage `plan`, with no run: the caps of the
// project apply to that call as they do to a plan run's, and only the Test button of the settings
// page is held to the small fixed ceiling of a test call.

const runCost = { maxCostMicros: 500_000, maxTokens: 2_000_000 };
const settings: ProjectSettings = {
  ...settingsFor({ planner: { provider: 'ollama', model: 'gemma4:e4b' } }),
};
const withPlannerCap: ProjectSettings = {
  ...settings,
  budget: { ...settings.budget, run: runCost, roles: { planner: { maxCostMicros: 300_000 } } },
};

async function plannerCaps(run: ProviderRun) {
  const harness = factoryHarness({ ollamaUrl: 'http://localhost:11434' });
  const request = harness.request({ settings: withPlannerCap, roles: ['planner'], run });
  const built = await harness.factory.build(request);
  const planner = built.ok ? built.value.get('planner')?.provider : undefined;
  if (planner === undefined) throw new Error('The planner was not built.');
  await planner.complete(callFor('planner', 'gemma4:e4b', 1));
  return harness.ledger.reservations[0]?.caps ?? [];
}

describe('caps of a call that belongs to no run', () => {
  it("ADR-007 the options of Plan setup keep the project's run caps and the planner's cap", async () => {
    const run: ProviderRun = {
      ...{ id: null, userId: testRun.userId, stage: 'plan' },
      projectId: '00000000-0000-4000-a000-0000000000c1',
    };

    const caps = await plannerCaps(run);

    expect(caps).toEqual(
      expect.arrayContaining([
        { kind: 'run-cost', limit: BigInt(runCost.maxCostMicros) },
        { kind: 'run-tokens', limit: BigInt(runCost.maxTokens) },
        { kind: 'role-cost', limit: 300_000n },
      ]),
    );
  });

  it('RF-407 a provider test is held to the fixed ceiling of one test call, without a role cap', async () => {
    const caps = await plannerCaps(testRun);

    expect(caps).toEqual(
      expect.arrayContaining([
        { kind: 'run-cost', limit: 100_000n },
        { kind: 'run-tokens', limit: 2_000n },
      ]),
    );
    expect(caps.some((cap) => cap.kind === 'role-cost')).toBe(false);
  });
});

describe('caps of a run-less call fail closed', () => {
  const ceiling = [
    { kind: 'run-cost', limit: 100_000n },
    { kind: 'run-tokens', limit: 2_000n },
  ];
  const project = '00000000-0000-4000-a000-0000000000c1';

  it.each([
    ['a stage that is not the plan stage', { stage: 'understand', projectId: project }],
    ['an unknown stage', { stage: 'invented', projectId: project }],
    ['the plan stage without a project to book it to', { stage: 'plan', projectId: null }],
  ])('ADR-007 %s gets the small ceiling, not the caps of a project', async (_name, given) => {
    const run = { id: null, userId: testRun.userId, ...given } as unknown as ProviderRun;

    const caps = await plannerCaps(run);

    expect(caps).toEqual(expect.arrayContaining(ceiling));
    expect(caps.some((cap) => cap.kind === 'role-cost')).toBe(false);
  });
});
