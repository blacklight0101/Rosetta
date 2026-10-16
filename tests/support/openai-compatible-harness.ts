import { Agent, request as httpRequest } from 'node:http';
import { afterEach } from 'vitest';
import { defaultMaxResponseBytes } from '../../src/infrastructure/providers/capped-response.js';
import {
  agentFetch,
  type FetchLike,
} from '../../src/infrastructure/providers/openai/agent-fetch.js';
import {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleProviderOptions,
} from '../../src/infrastructure/providers/openai/openai-compatible-provider.js';
import { FakeHttpServer, type Route } from './fake-http-server.js';
import { FakeOpenAiServer, loadOpenAiRecording } from './fake-openai-server.js';
import { fakeValue } from './fake-value.js';

// RF-403, ADR-008: an OpenAiCompatibleProvider pointed at a fake server on loopback with a FAKE
// key. The adapter's transport code runs unchanged over plain HTTP with a plain agent here: the
// public-address agent refuses loopback by design, so the guarded HTTPS transport is tested on its
// own (openai-compatible-guard.test.ts). Back-off waits are recorded instead of slept.

/** A FAKE key of an OpenAI-compatible service, built from harmless pieces (RNF-003). */
export const fakeCompatibleKey = ['sk', 'or', 'v1', fakeValue(48)].join('-');

export interface CompatibleHarness {
  readonly provider: OpenAiCompatibleProvider;
  readonly server: FakeHttpServer;
  readonly baseUrl: string;
  /** The back-off waits the provider asked for, in milliseconds. */
  readonly waits: number[];
}

export interface CompatibleOverrides extends Partial<
  Omit<OpenAiCompatibleProviderOptions, 'baseUrl' | 'sleep' | 'transport'>
> {
  readonly maxBytes?: number;
}

/** The adapter's transport over plain HTTP with a plain agent, for a loopback fake server. */
export function loopbackTransport(maxBytes = defaultMaxResponseBytes): FetchLike {
  return agentFetch({ protocol: 'http:', send: httpRequest, agent: new Agent(), maxBytes });
}

function providerFor(baseUrl: string, overrides: CompatibleOverrides, waits: number[]) {
  const { maxBytes, ...options } = overrides;
  return new OpenAiCompatibleProvider({
    apiKey: fakeCompatibleKey,
    timeoutSeconds: 5,
    maxRetries: 3,
    testMode: true,
    random: () => 0.5,
    ...options,
    baseUrl,
    transport: loopbackTransport(maxBytes),
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
}

/** Starts fake servers for one test file and stops them after each test. */
export function useFakeCompatible(): {
  readonly replay: (
    recording: string,
    overrides?: CompatibleOverrides,
  ) => Promise<CompatibleHarness>;
  readonly serve: (route: Route, overrides?: CompatibleOverrides) => Promise<CompatibleHarness>;
} {
  const servers: FakeHttpServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });
  const started = async (server: FakeHttpServer, overrides: CompatibleOverrides) => {
    servers.push(server);
    const baseUrl = `${await server.start()}/v1`;
    const waits: number[] = [];
    return { provider: providerFor(baseUrl, overrides, waits), server, baseUrl, waits };
  };
  return {
    replay: async (recording, overrides = {}) =>
      started(
        new FakeOpenAiServer(await loadOpenAiRecording(recording, 'openai-compatible')),
        overrides,
      ),
    serve: (route, overrides = {}) => started(new FakeHttpServer(route), overrides),
  };
}
