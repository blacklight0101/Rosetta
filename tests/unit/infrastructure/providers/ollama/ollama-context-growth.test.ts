import { describe, expect, it } from 'vitest';
import {
  newContextCache,
  OllamaContextResolver,
  type ContextProbe,
  type ModelRef,
  type ProbeResult,
  type Residency,
} from '../../../../../src/infrastructure/providers/ollama/ollama-context-resolver.js';
import { RecordingLogger } from '../../../../support/recording-logger.js';

// RF-401, Q-48: growing the automatic Ollama context size to fit a prompt, against a probe that
// simulates the GPU memory (no network).

const gemma: ModelRef = { model: 'gemma', digest: 'aaaa' };
const ok = <T>(value: T): ProbeResult<T> => ({ ok: true, value });

class FitsUpToProbe implements ContextProbe {
  private loaded = 0;
  private readonly trained: number | undefined;
  private readonly fitsUpTo: number;

  constructor(trained: number | undefined, fitsUpTo: number) {
    this.trained = trained;
    this.fitsUpTo = fitsUpTo;
  }

  trainedContext(): Promise<ProbeResult<number | undefined>> {
    return Promise.resolve(ok(this.trained));
  }

  load(_model: string, tokens: number): Promise<ProbeResult<undefined>> {
    this.loaded = tokens;
    return Promise.resolve(ok(undefined));
  }

  residency(): Promise<ProbeResult<Residency>> {
    const size = 8_000 + this.loaded;
    return Promise.resolve(ok({ size, sizeVram: this.loaded <= this.fitsUpTo ? size : size - 1 }));
  }
}

interface SimulatedGpu {
  readonly trained: number | undefined;
  readonly fitsUpTo: number;
}

function resolverFor(gpu: SimulatedGpu) {
  const logger = new RecordingLogger();
  const resolver = new OllamaContextResolver({
    serverUrl: 'http://127.0.0.1:11434',
    probe: new FitsUpToProbe(gpu.trained, gpu.fitsUpTo),
    logger,
    cache: newContextCache(),
    now: () => 1_000_000,
  });
  return { resolver, logger };
}

const warnings = (logger: RecordingLogger) => logger.records.filter((r) => r.level === 'warn');

describe('growing the automatic Ollama context size', () => {
  const grown = async (gpu: SimulatedGpu, needed: number) => {
    const made = resolverFor(gpu);
    const auto = await made.resolver.auto(gemma);
    return { ...made, auto, choice: await made.resolver.grow(gemma, auto, needed) };
  };

  it('RF-401 Q-48 keeps the automatic size when the prompt fits it', async () => {
    const { auto, choice, logger } = await grown({ trained: 131_072, fitsUpTo: 32_768 }, 32_768);

    expect(choice).toEqual(auto);
    expect(warnings(logger)).toEqual([]);
  });

  it('RF-401 Q-48 doubles from the automatic size to the smallest size that holds the prompt', async () => {
    const one = await grown({ trained: 131_072, fitsUpTo: 16_384 }, 16_385);
    const two = await grown({ trained: 131_072, fitsUpTo: 16_384 }, 40_000);

    expect(one.choice).toMatchObject({ tokens: 32_768, source: 'auto-grown' });
    expect(two.choice).toMatchObject({ tokens: 65_536, source: 'auto-grown' });
  });

  it('RF-401 Q-48 stops at a trained context that is not a power of two', async () => {
    const { choice } = await grown({ trained: 40_000, fitsUpTo: 32_768 }, 39_000);

    expect(choice).toMatchObject({ tokens: 40_000, source: 'auto-grown' });
  });

  it('RF-401 Q-48 gives up beyond the trained context, and when it is not known', async () => {
    const beyond = await grown({ trained: 131_072, fitsUpTo: 32_768 }, 131_073);
    const atLimit = await grown({ trained: 8_192, fitsUpTo: 65_536 }, 8_193);
    const unknown = await grown({ trained: undefined, fitsUpTo: 65_536 }, 40_000);

    expect(beyond.choice).toBeUndefined();
    expect(atLimit.choice).toBeUndefined();
    expect(unknown.choice).toBeUndefined();
  });
});

describe('a fixed or repeated growth of the Ollama context size', () => {
  it('RF-401 Q-48 never changes a fixed size', async () => {
    const { resolver } = resolverFor({ trained: 131_072, fitsUpTo: 32_768 });
    await resolver.auto(gemma);
    const fixed = { tokens: 4_096, source: 'fixed' } as const;

    expect(await resolver.grow(gemma, fixed, 50_000)).toBeUndefined();
  });

  it('RF-401 Q-48 warns once per model and size that part of the model runs on the CPU', async () => {
    const { resolver, logger } = resolverFor({ trained: 131_072, fitsUpTo: 32_768 });
    const base = await resolver.auto(gemma);

    await resolver.grow(gemma, base, 33_000);
    await resolver.grow(gemma, base, 34_000);
    expect(warnings(logger)).toHaveLength(1);
    await resolver.grow(gemma, base, 70_000);

    expect(warnings(logger)).toHaveLength(2);
    expect(warnings(logger)[0]).toMatchObject({
      data: { model: 'gemma', contextSize: 65_536 },
    });
    expect(warnings(logger)[0]?.message).toMatch(/CPU/);
  });
});
