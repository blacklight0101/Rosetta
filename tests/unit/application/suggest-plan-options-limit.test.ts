import { describe, expect, it } from 'vitest';
import { callLimitMs } from '../../../src/application/use-cases/suggest-plan-options.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { settingsFor } from '../../support/provider-factory-harness.js';

// Q-60: the options call is limited by the timeout of its provider, not by a fixed 120 s.

describe('callLimitMs', () => {
  it('Q-60 is the timeout of the provider for each attempt it may make', () => {
    const base = settingsFor({ planner: { provider: 'fake', model: 'fake-planner' } });
    const fake = base.providers['fake'];
    if (fake === undefined) throw new Error('the template has no fake provider');
    const providers = { ...base.providers, fake: { ...fake, timeoutSeconds: 90, maxRetries: 1 } };
    const project = sampleProject({ settings: { ...base, providers } });

    expect(callLimitMs(project, 'fake')).toBe(180_000);
  });

  it('Q-60 falls back to the defaults for a provider the settings do not name', () => {
    const project = sampleProject({
      settings: settingsFor({ planner: { provider: 'fake', model: 'fake-planner' } }),
    });

    expect(callLimitMs(project, 'unknown')).toBe(360_000);
  });
});
