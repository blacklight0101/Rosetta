import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { microUsd } from '../../../../src/domain/budget/money.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../../../src/infrastructure/providers/fake/fake-provider.js';
import { YazlArchiveWriter } from '../../../../src/infrastructure/files/yazl-archive-writer.js';
import { JsonlProviderCallLog } from '../../../../src/infrastructure/providers/jsonl-provider-call-log.js';
import { ObservedProvider } from '../../../../src/infrastructure/providers/observed-provider.js';
import type { Recording } from '../../../../src/infrastructure/providers/fake/recording.js';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { keyedSecretCases, secretCases } from '../../../support/secret-fixture.js';
import {
  apiSecret,
  mailSecret,
  smtpSecret,
  syntheticAppSettings,
} from '../../../support/secret-setting-shapes.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { collectBytes, filesOf, readZip } from '../../../support/zip-reader.js';
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
      masker: new SecretMasker(),
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

/** An answer that quotes the synthetic web.config. */
function configRecording(): Recording {
  return {
    schemaVersion: 1,
    description: 'an answer that quotes a web.config',
    calls: [
      {
        attempts: [
          {
            response: fakeResponse({
              text: syntheticAppSettings,
              toolCalls: [],
              requestId: 'req-settings',
              modelVersion: 'fake-1',
              finishReason: 'stop',
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                cachedInputTokens: 0,
                usageSource: 'reported',
              },
            }),
          },
        ],
      },
    ],
  };
}

/** One call whose request and answer both carry the synthetic web.config, logged into the run folder. */
async function callWithConfig(runDir: string): Promise<void> {
  const recording = configRecording();
  const provider = new ObservedProvider({
    inner: new FakeProvider({ testMode: true, recording }),
    recorder: new JsonlProviderCallLog({ runDir, masker: new SecretMasker() }),
    clock: new FixedClock('2026-10-11T09:05:03.007Z'),
    ids: new SequenceIdGenerator(),
    target: { provider: 'local-fake', kind: 'fake', endpointHost: 'fake.invalid' },
    priceCall: () => microUsd(0n),
    transcripts: true,
    masker: new SecretMasker(),
  });
  const request = contractRequest();
  await provider.complete({
    ...request,
    context: { ...request.context, agentTaskId: 'reader-settings', callId: 'settings-1' },
    messages: [{ role: 'user', content: syntheticAppSettings }],
  });
}

describe('provider output scan of key/value settings', () => {
  const tmp = useTempRoot('rosetta-scan-settings-');
  const scope = scopeFor('20261011-090503-understand');
  const runDir = (): string =>
    join(tmp.path, 'users', scope.userId, 'projects', scope.projectId, 'runs', scope.runKey);

  function expectNoValues(text: string): void {
    for (const secret of [smtpSecret, mailSecret, apiSecret]) {
      expect(text).not.toContain(secret);
    }
  }

  it('RF-141 the transcripts and the call log hold none of the values of the synthetic web.config', async () => {
    await callWithConfig(runDir());

    const written = await everything(tmp.path);

    expect(written).toContain('[MASKED:password]');
    expect(written).toContain('[MASKED:bearer-token]');
    expect(written).toContain('PageSize');
    expectNoValues(written);
  });

  it('RF-008, RF-141 the run zip holds none of the values of the synthetic web.config', async () => {
    await callWithConfig(runDir());

    const archive = await new YazlArchiveWriter(tmp.path).archive(scope, 'run');
    if (!archive.ok) throw new Error('the run folder was not archived');
    const files = filesOf(await readZip(await collectBytes(archive.value)));

    const text = Object.values(files).join('\n');
    expect(Object.keys(files).some((name) => name.includes('transcripts/'))).toBe(true);
    expect(text).toContain('[MASKED:password]');
    expectNoValues(text);
  });
});
