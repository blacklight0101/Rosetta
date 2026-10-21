import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '../../../../src/application/ports/llm-provider.js';
import type { ProviderSet } from '../../../../src/application/providers/provider-set.js';
import { realAdapters } from '../../../../src/infrastructure/providers/adapter-builder.js';
import { loadTextToolProtocol } from '../../../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import {
  callFor,
  factoryHarness,
  settingsFor,
  withContextTokens,
} from '../../../support/provider-factory-harness.js';
import { FakeOllamaServer, loadOllamaRecording } from '../../../support/fake-ollama-server.js';
import { numCtx } from '../../../support/ollama-harness.js';
import { RecordingLogger } from '../../../support/recording-logger.js';

// RF-401, DEC-114: a project's `providers.<name>.contextTokens` reaches the Ollama request. The chain
// is the provider factory, the adapter builder and the Ollama adapter, in front of a fake Ollama
// server on the loopback address (ADR-008); only the server is faked.

function unwrapped(result: { ok: true; value: ProviderSet } | { ok: false }): ProviderSet {
  if (!result.ok) throw new Error('The set was not built.');
  return result.value;
}

describe('a project context size reaches the Ollama request', () => {
  it.each([8192, 65_536])(
    'RF-401 a project with contextTokens %i sends that num_ctx to Ollama',
    async (tokens) => {
      const server = new FakeOllamaServer(await loadOllamaRecording('contract-text'));
      const baseUrl = await server.start();
      try {
        const textProtocolPrompt = (await loadTextToolProtocol(join(process.cwd(), 'prompts')))
          .text;
        const harness = factoryHarness({
          ollamaUrl: baseUrl,
          adapters: realAdapters({
            testMode: true,
            textProtocolPrompt,
            logger: new RecordingLogger(),
          }),
        });
        const settings = withContextTokens(
          settingsFor({ reader: { provider: 'ollama', model: 'contract-model' } }),
          'ollama',
          tokens,
        );
        const set = unwrapped(
          await harness.factory.build(harness.request({ settings, roles: ['reader'] })),
        );
        const reader: LlmProvider | undefined = set.get('reader')?.provider;

        await reader?.complete(callFor('reader', 'contract-model'));

        expect(numCtx(server.chatBodies())).toEqual([tokens]);
      } finally {
        await server.stop();
      }
    },
  );
});
