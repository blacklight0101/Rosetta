import { describe, expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { acceptedManifest } from '../../../../src/application/runs/accepted-manifest.js';
import { sampleProject, settingsWith } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RNF-004, Q-57: the manifest of a run records the output limit each role runs with: the number the
// project stores, else the default of the role's model.

const list: ModelList = {
  version: '2026-10-21',
  models: [
    {
      ...{ provider: 'anthropic', model: 'claude-small', label: 'Small output' },
      ...{ contextTokens: 200_000, maxOutputTokens: 3_000 },
    },
  ],
};

function manifestOf(changes: Record<string, unknown>, models?: ModelList) {
  const parsed = parseProjectSettings(
    settingsWith({
      'providers.anthropic.keySource': 'user',
      'roles.reader.provider': 'anthropic',
      'roles.reader.model': 'claude-small',
      'roles.reader.maxOutputTokens': undefined,
      'roles.verifier.provider': 'anthropic',
      'roles.verifier.model': 'claude-unlisted',
      'roles.verifier.maxOutputTokens': undefined,
      ...changes,
    }),
  );
  if (!parsed.ok) throw new Error('The settings were refused');
  const project = sampleProject({ settings: parsed.value });
  const accepted = { run: sampleRun(), project, rosettaVersion: '1.2.3-test', options: {} };
  return acceptedManifest(models === undefined ? accepted : { ...accepted, models });
}

describe('the output limits in the accepted manifest', () => {
  it('Q-57 records the default of the model, below its maximum, for a role without a stored limit', () => {
    const manifest = manifestOf({}, list);

    expect(manifest.roles['reader']?.maxOutputTokens).toBe(3_000);
    expect(manifest.roles['verifier']?.maxOutputTokens).toBe(4_000);
  });

  it('Q-57 records the number the project stores', () => {
    const manifest = manifestOf({ 'roles.reader.maxOutputTokens': 8_000 }, list);

    expect(manifest.roles['reader']?.maxOutputTokens).toBe(8_000);
  });

  it('Q-57 without a model list a hosted role takes the default of its role', () => {
    expect(manifestOf({}).roles['reader']?.maxOutputTokens).toBe(8_192);
  });

  it('P3-64 an Ollama role records the default it always had', () => {
    const manifest = manifestOf({ 'roles.planner.maxOutputTokens': undefined }, list);

    expect(manifest.roles['planner']?.maxOutputTokens).toBe(16_384);
    expect(manifest.roles['summariser']?.maxOutputTokens).toBe(2_048);
  });
});
