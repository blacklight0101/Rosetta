import { join } from 'node:path';
import { afterEach } from 'vitest';
import {
  OllamaProvider,
  type OllamaProviderOptions,
} from '../../src/infrastructure/providers/ollama/ollama-provider.js';
import { loadTextToolProtocol } from '../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import { FakeOllamaServer, loadOllamaRecording } from './fake-ollama-server.js';

// RF-401, ADR-008: an OllamaProvider pointed at a fake Ollama server that replays a recording.
// Back-off waits are recorded instead of slept, so retries take no time.

export interface OllamaHarness {
  readonly provider: OllamaProvider;
  readonly server: FakeOllamaServer;
  /** The back-off waits the provider asked for, in milliseconds. */
  readonly waits: number[];
}

export type HarnessOverrides = Partial<
  Omit<OllamaProviderOptions, 'baseUrl' | 'textProtocolPrompt' | 'sleep'>
>;

const promptsFolder = join(process.cwd(), 'prompts');

/** Starts fake Ollama servers for one test file and stops them after each test. */
export function useFakeOllama(): (
  recording: string,
  overrides?: HarnessOverrides,
) => Promise<OllamaHarness> {
  const servers: FakeOllamaServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });
  return async (recording, overrides = {}) => {
    const server = new FakeOllamaServer(await loadOllamaRecording(recording));
    servers.push(server);
    const baseUrl = await server.start();
    const waits: number[] = [];
    const provider = new OllamaProvider({
      baseUrl,
      toolMode: 'native',
      timeoutSeconds: 5,
      maxRetries: 3,
      testMode: true,
      fakeServer: true,
      random: () => 0.5,
      ...overrides,
      textProtocolPrompt: await loadTextToolProtocol(promptsFolder),
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    return { provider, server, waits };
  };
}
