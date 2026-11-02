import { describe, expect, it } from 'vitest';
import {
  runCapsFor,
  uncappedLocalRun,
} from '../../../../src/application/projects/local-run-caps.js';
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

// P8-04, RF-433: a template project reads every role from the `ollama` provider.
describe('RF-433 an Ollama server that is not this machine is not a local provider', () => {
  const ceilings = { maxCostMicros: 100_000_000, maxTokens: 50_000_000 };

  it('RF-433 counts Ollama on this machine as local, by every name of RF-143', () => {
    for (const host of ['localhost', '127.0.0.1', 'host.docker.internal', undefined]) {
      expect(uncappedLocalRun(withSetting(true), host)).toBe(true);
    }
  });

  it('RF-433 keeps the caps of a run on Ollama at a remote host, whatever the setting', () => {
    for (const host of ['ollama.example.org', '203.0.113.7', 'localhost.example.org']) {
      expect(uncappedLocalRun(withSetting(true), host)).toBe(false);
      expect(runCapsFor(withSetting(true), host)).toEqual(templateSettings.budget.run);
    }
  });

  it('RF-433 a remote Ollama host does not make the fake provider remote', () => {
    const fake = (role: string) => ({ provider: 'fake', model: role });
    const settings: ProjectSettings = {
      ...withSetting(true),
      roles: {
        reader: { ...templateSettings.roles.reader, ...fake('reader') },
        verifier: { ...templateSettings.roles.verifier, ...fake('verifier') },
        planner: { ...templateSettings.roles.planner, ...fake('planner') },
        summariser: { ...templateSettings.roles.summariser, ...fake('summariser') },
      },
    };

    expect(uncappedLocalRun(settings, 'ollama.example.org')).toBe(true);
  });

  it('RF-433 gives an uncapped local run the administrator ceilings as its run caps', () => {
    expect(runCapsFor(withSetting(true), 'localhost')).toEqual(ceilings);
    expect(runCapsFor(withSetting(false), 'localhost')).toEqual(templateSettings.budget.run);
  });
});
