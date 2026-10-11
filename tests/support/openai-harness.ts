import { afterEach } from 'vitest';
import {
  OpenAiProvider,
  type OpenAiProviderOptions,
} from '../../src/infrastructure/providers/openai/openai-provider.js';
import { FakeOpenAiServer, loadOpenAiRecording } from './fake-openai-server.js';
import { fakeOpenAiKey } from './secret-fixture.js';

// RF-402, ADR-008: an OpenAiProvider pointed at a fake OpenAI server that replays a recording,
// with a FAKE key. Back-off waits are recorded instead of slept, so retries take no time.

export interface OpenAiHarness {
  readonly provider: OpenAiProvider;
  readonly server: FakeOpenAiServer;
  /** The back-off waits the provider asked for, in milliseconds. */
  readonly waits: number[];
}

export type OpenAiOverrides = Partial<Omit<OpenAiProviderOptions, 'baseUrl' | 'sleep'>>;

/** Starts fake OpenAI servers for one test file and stops them after each test. */
export function useFakeOpenAi(): (
  recording: string,
  overrides?: OpenAiOverrides,
) => Promise<OpenAiHarness> {
  const servers: FakeOpenAiServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });
  return async (recording, overrides = {}) => {
    const server = new FakeOpenAiServer(await loadOpenAiRecording(recording));
    servers.push(server);
    const baseUrl = `${await server.start()}/v1`;
    const waits: number[] = [];
    const provider = new OpenAiProvider({
      apiKey: fakeOpenAiKey,
      timeoutSeconds: 5,
      maxRetries: 3,
      testMode: true,
      fakeServer: true,
      random: () => 0.5,
      ...overrides,
      baseUrl,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    return { provider, server, waits };
  };
}
