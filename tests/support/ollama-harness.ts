import { join } from 'node:path';
import { afterEach } from 'vitest';
import {
  OllamaProvider,
  type OllamaProviderOptions,
} from '../../src/infrastructure/providers/ollama/ollama-provider.js';
import { newContextCache } from '../../src/infrastructure/providers/ollama/ollama-context-resolver.js';
import { loadTextToolProtocol } from '../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import { FakeOllamaServer, loadOllamaRecording } from './fake-ollama-server.js';
import { RecordingLogger } from './recording-logger.js';

// RF-401, ADR-008: an OllamaProvider pointed at a fake Ollama server that replays a recording.
// Back-off waits are recorded instead of slept, so retries take no time.

export interface OllamaHarness {
  readonly provider: OllamaProvider;
  readonly server: FakeOllamaServer;
  /** The back-off waits the provider asked for, in milliseconds. */
  readonly waits: number[];
  /** What the provider logged, such as the context-size warnings (DEC-114). */
  readonly logger: RecordingLogger;
  /** Another provider on the same fake server, as a second run of the same process would make. */
  readonly another: () => OllamaProvider;
}

export type HarnessOverrides = Partial<
  Omit<OllamaProviderOptions, 'baseUrl' | 'textProtocolPrompt' | 'sleep' | 'logger'>
> & {
  /** Leave the context cache option out, so the providers use the process-wide cache (DEC-114). */
  readonly processCache?: boolean;
};

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
    const logger = new RecordingLogger();
    const { text: textProtocolPrompt } = await loadTextToolProtocol(promptsFolder);
    // Each harness starts from an empty context cache; `another` shares it, as one process would.
    const contextCache = newContextCache();
    const { processCache, ...optionOverrides } = overrides;
    const cacheOption = processCache === true ? {} : { contextCache };
    const create = (): OllamaProvider =>
      new OllamaProvider({
        baseUrl,
        toolMode: 'native',
        timeoutSeconds: 5,
        maxRetries: 3,
        testMode: true,
        random: () => 0.5,
        ...cacheOption,
        ...optionOverrides,
        textProtocolPrompt,
        logger,
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      });
    return { provider: create(), server, waits, logger, another: create };
  };
}

/** The `options.num_ctx` of each request body, in order (RF-401, DEC-114). */
export function numCtx(bodies: unknown[]): unknown[] {
  return bodies.map((body) => {
    const options: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'options') : undefined;
    const value: unknown =
      typeof options === 'object' && options !== null ? Reflect.get(options, 'num_ctx') : undefined;
    return value;
  });
}
