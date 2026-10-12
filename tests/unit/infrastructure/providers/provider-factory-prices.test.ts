import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  factoryAccount,
  factoryHarness,
  serverKeyText,
  settingsFor,
  userKeyText,
} from '../../../support/provider-factory-harness.js';

// RF-427, RF-420, DEC-112: a model without a price is refused when the run's provider set is built,
// so the run stops before any call; only the user's own key with `budget.allowUnpriced` may run it.

const unpriced = settingsFor({ reader: { provider: 'openai', model: 'not-in-the-table' } });

function allowingUnpriced(settings: ProjectSettings): ProjectSettings {
  return { ...settings, budget: { ...settings.budget, allowUnpriced: true } };
}

describe('unpriced models at the start of a run', () => {
  it('RF-427 a cloud model missing from the price table is refused on a server key before any call', async () => {
    const harness = factoryHarness({ serverKeys: { openai: serverKeyText } });

    const built = await harness.factory.build(
      harness.request({ settings: allowingUnpriced(unpriced), cloudConsent: true }),
    );

    expect(built.ok).toBe(false);
    expect(!built.ok && built.error).toEqual([
      { role: 'reader', provider: 'openai', code: ERROR_CODES.modelUnpriced },
    ]);
    expect(harness.fakeList.flatMap((fake) => fake.requests)).toEqual([]);
  });

  it('RF-427 the user own key without allowUnpriced is refused too', async () => {
    const harness = factoryHarness();
    await harness.storeKey(factoryAccount.id, 'openai', userKeyText);

    const built = await harness.factory.build(
      harness.request({ settings: unpriced, cloudConsent: true }),
    );

    expect(built.ok).toBe(false);
    expect(!built.ok && built.error.map((problem) => problem.code)).toEqual([
      ERROR_CODES.modelUnpriced,
    ]);
  });

  it('RF-427 the user own key with allowUnpriced builds the set', async () => {
    const harness = factoryHarness();
    await harness.storeKey(factoryAccount.id, 'openai', userKeyText);

    const built = await harness.factory.build(
      harness.request({ settings: allowingUnpriced(unpriced), cloudConsent: true }),
    );

    expect(built.ok).toBe(true);
  });

  it('RF-420 a local model missing from the table builds: it costs nothing', async () => {
    const harness = factoryHarness({ ollamaUrl: 'http://127.0.0.1:11434' });
    const settings = settingsFor({ reader: { provider: 'ollama', model: 'not-in-the-table' } });

    const built = await harness.factory.build(harness.request({ settings }));

    expect(built.ok).toBe(true);
  });
});
