import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { microUsd } from '../../../../src/domain/budget/money.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../../../src/infrastructure/providers/fake/fake-provider.js';
import { JsonlProviderCallLog } from '../../../../src/infrastructure/providers/jsonl-provider-call-log.js';
import { ObservedProvider } from '../../../../src/infrastructure/providers/observed-provider.js';
import type { Recording } from '../../../../src/infrastructure/providers/fake/recording.js';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { keyedSecretCases, secretCases } from '../../../support/secret-fixture.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { useTempRoot } from '../../../support/temp-root.js';

/** Every file under `root`, concatenated. */
async function everything(root: string): Promise<string> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const texts = await Promise.all(
    files.map((file) => readFile(join(file.parentPath, file.name), 'utf8')),
  );
  return texts.join('\n');
}

/** One call per fixture secret: a retried attempt, then an answer that echoes the secret. */
function echoingRecording(): Recording {
  return {
    schemaVersion: 1,
    description: 'answers that echo fake secrets',
    calls: secretCases.map(({ text }) => ({
      attempts: [
        { failure: { code: 'RST-1504', httpStatus: 429, requestId: text } },
        {
          response: fakeResponse({
            text,
            toolCalls: [
              { id: text, name: text, arguments: { [text]: text } },
              ...keyedSecretCases.map((keyed, index) => ({
                id: `keyed-${String(index)}`,
                name: 'read_file',
                arguments: keyed.arguments,
              })),
            ],
            requestId: text,
            modelVersion: text,
            finishReason: 'tool_use',
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              cachedInputTokens: 0,
              usageSource: 'reported',
            },
          }),
        },
      ],
    })),
  };
}

describe('provider output scan', () => {
  const tmp = useTempRoot('rosetta-scan-');

  it('RNF-003 no file the call log writes in the run folder holds a fixture secret', async () => {
    const provider = new ObservedProvider({
      inner: new FakeProvider({ testMode: true, recording: echoingRecording() }),
      recorder: new JsonlProviderCallLog({ runDir: tmp.path, masker: new SecretMasker() }),
      clock: new FixedClock('2026-10-11T09:05:03.007Z'),
      ids: new SequenceIdGenerator(),
      target: { provider: 'local-fake', kind: 'fake', endpointHost: 'fake.invalid' },
      priceCall: () => microUsd(0n),
      transcripts: true,
    });
    // One agent task for every case: each new task costs a transcript file of its own, the slowest
    // disk operation of the call log on Windows (P1-141). The masking is per line, so it is still
    // checked for every case.
    for (const { text } of secretCases) {
      const request = contractRequest();
      await provider.complete({
        ...request,
        context: { ...request.context, agentTaskId: 'task-scan', callId: text },
        model: text,
        system: text,
        messages: [{ role: 'user', content: text }],
      });
    }

    const written = await everything(tmp.path);
    expect(written).toContain('[MASKED:');
    const secrets = [...secretCases, ...keyedSecretCases].flatMap((item) => item.secrets);
    for (const secret of secrets) {
      expect(written).not.toContain(secret);
    }
  });
});
