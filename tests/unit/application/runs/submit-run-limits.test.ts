import { expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { SubmitRun } from '../../../../src/application/use-cases/submit-run.js';
import { sampleProject, settingsWith } from '../../../support/project-fixtures.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RNF-004, Q-57: the run that is accepted records, in its manifest, the output limit its roles run
// with, taken from the model list the server was started with.

const models: ModelList = {
  version: '2026-10-21',
  models: [
    {
      ...{ provider: 'anthropic', model: 'claude-small', label: 'Small output' },
      ...{ contextTokens: 200_000, maxOutputTokens: 3_000 },
    },
  ],
};

it('Q-57 records the output limit a role takes from the model list in the manifest of the run', async () => {
  const h = createRunHarness();
  const submit = new SubmitRun({
    ...{ runs: h.runs, manifests: h.manifests, queue: h.queue, clock: h.clock, models },
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
  });
  const parsed = parseProjectSettings(
    settingsWith({
      'providers.anthropic.keySource': 'user',
      'roles.reader.provider': 'anthropic',
      'roles.reader.model': 'claude-small',
      'roles.reader.maxOutputTokens': undefined,
    }),
  );
  if (!parsed.ok) throw new Error('The settings were refused');
  const project = sampleProject({ userId: userAmy.userId, settings: parsed.value });

  const submitted = await submit.execute({
    actor: userAmy,
    project,
    stage: 'understand',
    options: {},
  });

  if (!submitted.ok) throw new Error('The run was not accepted');
  const manifest = await h.manifests.read(h.scopeOf(submitted.value.run));
  expect(manifest?.roles['reader']?.maxOutputTokens).toBe(3_000);
});
