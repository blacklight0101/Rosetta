import { afterEach } from 'vitest';
import {
  AnthropicProvider,
  type AnthropicProviderOptions,
} from '../../src/infrastructure/providers/anthropic/anthropic-provider.js';
import { FakeAnthropicServer, loadAnthropicRecording } from './fake-anthropic-server.js';
import { fakeAnthropicKey } from './secret-fixture.js';

// RF-404, ADR-008: an AnthropicProvider pointed at a fake Anthropic server that replays a
// recording, with a FAKE key. Back-off waits are recorded instead of slept, so retries take no time.

export interface AnthropicHarness {
  readonly provider: AnthropicProvider;
  readonly server: FakeAnthropicServer;
  /** The back-off waits the provider asked for, in milliseconds. */
  readonly waits: number[];
}

export type AnthropicOverrides = Partial<Omit<AnthropicProviderOptions, 'baseUrl' | 'sleep'>>;

/** Starts fake Anthropic servers for one test file and stops them after each test. */
export function useFakeAnthropic(): (
  recording: string,
  overrides?: AnthropicOverrides,
) => Promise<AnthropicHarness> {
  const servers: FakeAnthropicServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });
  return async (recording, overrides = {}) => {
    const server = new FakeAnthropicServer(await loadAnthropicRecording(recording));
    servers.push(server);
    const baseUrl = await server.start();
    const waits: number[] = [];
    const provider = new AnthropicProvider({
      apiKey: fakeAnthropicKey,
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
