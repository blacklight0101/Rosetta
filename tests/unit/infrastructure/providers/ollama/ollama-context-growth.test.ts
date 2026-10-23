import { describe, expect, it } from 'vitest';
import {
  KEPT_LIMIT,
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
  const cache = newContextCache();
  const resolver = new OllamaContextResolver({
    serverUrl: 'http://127.0.0.1:11434',
    probe: new FitsUpToProbe(gpu.trained, gpu.fitsUpTo),
    logger,
    cache,
    now: () => 1_000_000,
  });
  return { resolver, logger, cache };
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

describe('keeping the grown Ollama context size for the rest of a run (P5-04, EV-21)', () => {
  const gpu: SimulatedGpu = { trained: 131_072, fitsUpTo: 32_768 };

  it('P5-04 reuses the grown size for a smaller prompt of the same role', async () => {
    const { resolver } = resolverFor(gpu);
    const auto = await resolver.auto(gemma);

    const big = await resolver.grow(gemma, auto, 40_000, 'run-1');
    const small = await resolver.grow(gemma, auto, 1_000, 'run-1');

    expect(big).toMatchObject({ tokens: 65_536, source: 'auto-grown' });
    expect(small).toMatchObject({ tokens: 65_536, source: 'auto-grown' });
  });

  it('P5-04 never alternates in a sequence of calls that needs 65,536 then 32,768 again', async () => {
    const { resolver } = resolverFor(gpu);
    const auto = await resolver.auto(gemma);
    const sent: (number | undefined)[] = [];

    for (const needed of [40_000, 20_000, 40_000, 10_000, 33_000]) {
      sent.push((await resolver.grow(gemma, auto, needed, 'run-1'))?.tokens);
    }

    expect(sent).toEqual([65_536, 65_536, 65_536, 65_536, 65_536]);
  });

  it('P5-04 gives another role on the same model in the same run the kept size', async () => {
    const { resolver } = resolverFor(gpu);
    const auto = await resolver.auto(gemma);

    await resolver.grow(gemma, auto, 40_000, 'run-1');
    const reader = await resolver.grow(gemma, auto, 1_000, 'run-1');

    expect(reader).toMatchObject({ tokens: 65_536, source: 'auto-grown' });
  });

  it('P5-04 starts a different run from the automatic size', async () => {
    const { resolver } = resolverFor(gpu);
    const auto = await resolver.auto(gemma);

    await resolver.grow(gemma, auto, 40_000, 'run-1');

    expect(await resolver.grow(gemma, auto, 1_000, 'run-2')).toEqual(auto);
  });
});

describe('the kept Ollama context size per model and its limit (P5-04)', () => {
  const gpu: SimulatedGpu = { trained: 131_072, fitsUpTo: 32_768 };

  it('P5-04 keeps the size of each model on its own', async () => {
    const { resolver } = resolverFor(gpu);
    const other: ModelRef = { model: 'llama', digest: 'bbbb' };
    const auto = await resolver.auto(gemma);
    const otherAuto = await resolver.auto(other);

    await resolver.grow(gemma, auto, 40_000, 'run-1');

    expect(await resolver.grow(other, otherAuto, 1_000, 'run-1')).toEqual(otherAuto);
  });

  it('P5-04 holds at most KEPT_LIMIT sizes and drops the oldest first', async () => {
    const { resolver, cache } = resolverFor(gpu);
    const auto = await resolver.auto(gemma);

    for (let run = 0; run < KEPT_LIMIT + 10; run++) {
      await resolver.grow(gemma, auto, 40_000, `run-${String(run)}`);
    }

    expect(cache.kept.size).toBe(KEPT_LIMIT);
    expect(await resolver.grow(gemma, auto, 1_000, 'run-0')).toEqual(auto);
    expect(await resolver.grow(gemma, auto, 1_000, `run-${String(KEPT_LIMIT + 9)}`)).toMatchObject({
      tokens: 65_536,
    });
  });
});

describe('growing again and refusing with a kept Ollama context size (P5-04)', () => {
  const gpu: SimulatedGpu = { trained: 131_072, fitsUpTo: 32_768 };

  it('P5-04 still grows further when a later prompt needs more (P3-75 rules)', async () => {
    const { resolver } = resolverFor(gpu);
    const auto = await resolver.auto(gemma);

    await resolver.grow(gemma, auto, 40_000, 'run-1');
    const more = await resolver.grow(gemma, auto, 70_000, 'run-1');

    expect(more).toMatchObject({ tokens: 131_072, source: 'auto-grown' });
  });

  it('P5-04 does not keep a size for a refused prompt, and never changes a fixed size', async () => {
    const { resolver } = resolverFor(gpu);
    const auto = await resolver.auto(gemma);
    const fixed = { tokens: 4_096, source: 'fixed' } as const;

    expect(await resolver.grow(gemma, auto, 200_000, 'run-1')).toBeUndefined();
    expect(await resolver.grow(gemma, auto, 1_000, 'run-1')).toEqual(auto);
    await resolver.grow(gemma, auto, 40_000, 'run-1');
    expect(await resolver.grow(gemma, fixed, 1_000, 'run-1')).toEqual(fixed);
  });

  it('P5-04 warns once about the kept size, not on every reuse', async () => {
    const { resolver, logger } = resolverFor(gpu);
    const auto = await resolver.auto(gemma);

    for (const needed of [40_000, 1_000, 2_000]) await resolver.grow(gemma, auto, needed, 'run-1');

    expect(warnings(logger)).toHaveLength(1);
  });
});
