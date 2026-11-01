import { describe, expect, it } from 'vitest';
import { uncappedLocalRun } from '../../../../src/application/projects/local-run-caps.js';
import {
  parseProjectSettings,
  type ProjectSettings,
} from '../../../../src/application/projects/project-settings.js';
import { templateSettings } from '../../../support/project-fixtures.js';

// RF-433, DEC-197: "No cap for local models" lifts the run caps and the pause only for a run whose
// every role is on a local provider, and only when the project turned it on.

function withSetting(on: boolean | undefined, settings = templateSettings): ProjectSettings {
  const budget = { ...settings.budget };
  if (on === undefined) delete budget.noCapForLocalModels;
  else budget.noCapForLocalModels = on;
  return { ...settings, budget };
}

const oneCloudRole = (role: 'reader' | 'verifier' | 'planner' | 'summariser'): ProjectSettings => ({
  ...templateSettings,
  roles: {
    ...templateSettings.roles,
    [role]: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  },
});

describe('RF-433 no cap for local models', () => {
  it('RF-433 lifts the caps of a run whose every role is local when the setting is on', () => {
    expect(uncappedLocalRun(withSetting(true))).toBe(true);
  });

  it('RF-433 keeps the caps when the setting is off or was never set', () => {
    expect(uncappedLocalRun(withSetting(false))).toBe(false);
    expect(uncappedLocalRun(withSetting(undefined))).toBe(false);
  });

  it('RF-433 keeps every cap when one role of the run is on a cloud provider', () => {
    for (const role of ['reader', 'verifier', 'planner', 'summariser'] as const) {
      expect(uncappedLocalRun(withSetting(true, oneCloudRole(role)))).toBe(false);
    }
  });

  it('RF-433 the setting is optional and off by default in the stored document', () => {
    const parsed = parseProjectSettings(JSON.parse(JSON.stringify(withSetting(true))));
    expect(parsed.ok && parsed.value.budget.noCapForLocalModels).toBe(true);
    expect(templateSettings.budget.noCapForLocalModels).toBeUndefined();
  });
});
