import { describe, expect, it } from 'vitest';
import { writeInvalidOutput } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardLogger } from '../../../support/card-output-harness.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { openWriter } from '../../../support/open-writer.js';

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const folder = 'projects/p1/runs/20261012-100000-understand';

describe('writeInvalidOutput on the real output writer', () => {
  const data = useTempRoot('rosetta-invalid-');

  it('RF-202 raw output of a task marked InvalidOutput is saved, masked, in the run folder', async () => {
    const outputs = openWriter(data.path);
    const rawOutputs = [`not json ${fakeOpenAiKey}`, 'second try'];

    const result = await writeInvalidOutput(
      outputs,
      { userId, folder },
      { agentTaskId: 'task-orders', rawOutputs, masker: new SecretMasker(), logger: cardLogger() },
    );

    expect(result.ok).toBe(true);
    const path = `${folder}/invalid-output/task-orders.txt`;
    const saved = await outputs.readText({ userId, path });
    expect(saved.ok && saved.value).toContain('second try');
    expect(saved.ok && saved.value).not.toContain(fakeOpenAiKey);
    expect(saved.ok && saved.value).toContain('[MASKED:api-key]');
  });

  it('RF-202 an agent task id that is not a plain id cannot choose the file path', async () => {
    const result = await writeInvalidOutput(
      openWriter(data.path),
      { userId, folder },
      {
        agentTaskId: '../../escape',
        rawOutputs: ['x'],
        masker: new SecretMasker(),
        logger: cardLogger(),
      },
    );

    expect(result.ok).toBe(false);
  });
});
