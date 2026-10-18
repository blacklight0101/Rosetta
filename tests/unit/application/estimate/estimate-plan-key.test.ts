import { describe, expect, it } from 'vitest';
import type { ServerKeyPresence } from '../../../../src/application/ports/server-key-presence.js';
import {
  createPlanEstimateHarness,
  plannerSettings,
} from '../../../support/plan-estimate-harness.js';
import { sampleKeyRecord } from '../../../support/provider-key-fixtures.js';

// RF-613, RF-1104, RST-2302: the figures of the plan estimate say what the call costs, not whether it
// would be made. `keyAvailable` says the second thing with the budget guard's own key choice: the
// user's key, else the server's when the provider's `keySource` setting, the account and the
// server's environment all allow it, else the run is refused with RST-2302.

const cloud = plannerSettings({ provider: 'openai', model: 'priced-model' });
const noServerKeys: ServerKeyPresence = { has: () => false };

async function keyAvailable(
  options: Parameters<typeof createPlanEstimateHarness>[0] = {},
): Promise<boolean> {
  const h = await createPlanEstimateHarness({ settings: cloud, ...options });
  const outcome = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!outcome.ok) throw new Error(`The estimate was refused: ${outcome.error}`);
  return outcome.value.keyAvailable;
}

describe('EstimatePlan: the planner key', () => {
  it('RF-1104 a cloud planner on the server key is available when the server holds that key', async () => {
    expect(await keyAvailable()).toBe(true);
  });

  it('RST-2302 a cloud planner is not available when the server holds no key for the provider', async () => {
    expect(await keyAvailable({ serverKeys: noServerKeys })).toBe(false);
  });

  it('RST-2302 the server holds a key of another provider only: not available', async () => {
    const onlyAnthropic: ServerKeyPresence = { has: (provider) => provider === 'anthropic' };

    expect(await keyAvailable({ serverKeys: onlyAnthropic })).toBe(false);
  });

  it('RF-1104 an account the administrator keeps off the server keys has no key to use', async () => {
    expect(await keyAvailable({ account: { serverKeysAllowed: false } })).toBe(false);
  });

  it('RF-1104 the user’s own key is enough when the server holds none, or may not be used', async () => {
    const own = async (extra: object) => {
      const h = await createPlanEstimateHarness({ settings: cloud, ...extra });
      await h.keys.upsert(sampleKeyRecord(h.actor.userId, 'openai'));
      const outcome = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
      return outcome.ok && outcome.value.keyAvailable;
    };

    expect(await own({ serverKeys: noServerKeys })).toBe(true);
    expect(await own({ account: { serverKeysAllowed: false } })).toBe(true);
  });

  it('RF-613 a local planner needs no key', async () => {
    const local = plannerSettings({ provider: 'ollama', model: 'gemma4:e4b' });

    expect(await keyAvailable({ settings: local, serverKeys: noServerKeys })).toBe(true);
  });
});
