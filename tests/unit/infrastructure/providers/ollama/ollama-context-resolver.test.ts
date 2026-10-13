import { describe, expect, it } from 'vitest';
import {
  clearContextCache,
  newContextCache,
  OllamaContextResolver,
  type ContextProbe,
  type ModelRef,
  type ProbeResult,
  type Residency,
} from '../../../../../src/infrastructure/providers/ollama/ollama-context-resolver.js';
import * as resolverModule from '../../../../../src/infrastructure/providers/ollama/ollama-context-resolver.js';
import { FALLBACK_BACKOFF_MS } from '../../../../../src/infrastructure/providers/ollama/ollama-context.js';
import { RecordingLogger } from '../../../../support/recording-logger.js';

// RF-401, DEC-114, Q-23: the automatic Ollama context size, against a probe that simulates the
// GPU memory instead of a server (no network).

const gemma: ModelRef = { model: 'gemma', digest: 'aaaa' };
const ok = <T>(value: T): ProbeResult<T> => ({ ok: true, value });
const unavailable: ProbeResult<never> = { ok: false, reason: 'HTTP 404' };

interface SimulatedGpu {
  /** The model's trained context; undefined when /api/show names none; null when it fails. */
  readonly trained: number | undefined | null;
  /** The largest context that keeps the whole model in GPU memory. */
  readonly fitsUpTo: number;
  readonly psFails?: boolean;
  /** /api/ps fails from this read on (1 is the first read). */
  readonly psFailsFrom?: number;
}

class SimulatedProbe implements ContextProbe {
  readonly loads: number[] = [];
  shows = 0;
  psReads = 0;
  private readonly gpu: SimulatedGpu;

  constructor(gpu: SimulatedGpu) {
    this.gpu = gpu;
  }

  trainedContext(): Promise<ProbeResult<number | undefined>> {
    this.shows += 1;
    return Promise.resolve(this.gpu.trained === null ? unavailable : ok(this.gpu.trained));
  }

  load(_model: string, tokens: number): Promise<ProbeResult<undefined>> {
    this.loads.push(tokens);
    return Promise.resolve(ok(undefined));
  }

  residency(): Promise<ProbeResult<Residency>> {
    this.psReads += 1;
    if (this.gpu.psFails === true) return Promise.resolve(unavailable);
    const failsFrom = this.gpu.psFailsFrom ?? Infinity;
    if (this.psReads >= failsFrom) return Promise.resolve(unavailable);
    const loaded = this.loads.at(-1) ?? 0;
    const size = 8_000 + loaded;
    const sizeVram = loaded <= this.gpu.fitsUpTo ? size : size - 1_000;
    return Promise.resolve(ok({ size, sizeVram }));
  }
}

function resolverFor(gpu: SimulatedGpu) {
  const probe = new SimulatedProbe(gpu);
  const logger = new RecordingLogger();
  const clock = { ms: 1_000_000 };
  const cache = newContextCache();
  const resolver = new OllamaContextResolver({
    serverUrl: 'http://127.0.0.1:11434',
    probe,
    logger,
    cache,
    now: () => clock.ms,
  });
  return { probe, logger, resolver, clock, cache };
}

const warnings = (logger: RecordingLogger) => logger.records.filter((r) => r.level === 'warn');

describe('automatic Ollama context size', () => {
  it('RF-401 halves from the ceiling while part of the model is on the CPU and keeps the first fit', async () => {
    const { probe, resolver, logger } = resolverFor({ trained: 131_072, fitsUpTo: 16_384 });

    const choice = await resolver.auto(gemma);

    expect(choice).toEqual({ tokens: 16_384, source: 'auto-fit' });
    expect(probe.loads).toEqual([32_768, 16_384]);
    expect(warnings(logger)).toEqual([]);
  });

  it('RF-401 keeps the ceiling when the model fits there', async () => {
    const { probe, resolver } = resolverFor({ trained: 131_072, fitsUpTo: 65_536 });

    expect(await resolver.auto(gemma)).toEqual({ tokens: 32_768, source: 'auto-fit' });
    expect(probe.loads).toEqual([32_768]);
  });

  it("RF-401 never goes above the model's trained context", async () => {
    const { probe, resolver } = resolverFor({ trained: 8_192, fitsUpTo: 65_536 });

    expect(await resolver.auto(gemma)).toEqual({ tokens: 8_192, source: 'auto-model-limit' });
    expect(probe.loads).toEqual([8_192]);
  });

  it('RF-401 starts at the ceiling when /api/show names no trained context', async () => {
    const { probe, resolver } = resolverFor({ trained: undefined, fitsUpTo: 65_536 });

    expect(await resolver.auto(gemma)).toEqual({ tokens: 32_768, source: 'auto-fit' });
    expect(probe.loads).toEqual([32_768]);
  });

  it('RF-401 halving stops at the floor even from a size that is not a power of two', async () => {
    const { probe, resolver } = resolverFor({ trained: 10_000, fitsUpTo: 4_096 });

    expect(await resolver.auto(gemma)).toEqual({ tokens: 4_096, source: 'auto-fit' });
    expect(probe.loads).toEqual([10_000, 5_000, 4_096]);
  });

  it('RF-401 uses the floor with one warning when even the floor leaves part of the model on the CPU', async () => {
    const { probe, resolver, logger } = resolverFor({ trained: 131_072, fitsUpTo: 1_024 });

    expect(await resolver.auto(gemma)).toEqual({ tokens: 4_096, source: 'auto-floor' });
    expect(probe.loads).toEqual([32_768, 16_384, 8_192, 4_096]);
    expect(warnings(logger)).toHaveLength(1);
  });
});

describe('automatic Ollama context size cache', () => {
  it('RF-401 resolves once per model: later and concurrent calls share the result', async () => {
    const { probe, resolver } = resolverFor({ trained: 131_072, fitsUpTo: 16_384 });

    const [first, second] = await Promise.all([resolver.auto(gemma), resolver.auto(gemma)]);
    const third = await resolver.auto(gemma);

    expect([first, second, third]).toEqual([
      { tokens: 16_384, source: 'auto-fit' },
      { tokens: 16_384, source: 'auto-fit' },
      { tokens: 16_384, source: 'auto-fit' },
    ]);
    expect(probe.shows).toBe(1);
    expect(probe.loads).toEqual([32_768, 16_384]);
  });

  it('RF-401 a model with another digest is resolved again', async () => {
    const { probe, resolver } = resolverFor({ trained: 131_072, fitsUpTo: 65_536 });

    await resolver.auto(gemma);
    await resolver.auto({ model: 'gemma', digest: 'bbbb' });

    expect(probe.shows).toBe(2);
  });
});

describe('automatic Ollama context size when Ollama cannot be probed', () => {
  it('RF-401 falls back to the ceiling with a warning when /api/show fails, and probes again after the back-off', async () => {
    const { probe, resolver, logger, clock } = resolverFor({ trained: null, fitsUpTo: 65_536 });

    expect(await resolver.auto(gemma)).toEqual({ tokens: 32_768, source: 'auto-fallback' });
    clock.ms += FALLBACK_BACKOFF_MS;
    expect(await resolver.auto(gemma)).toEqual({ tokens: 32_768, source: 'auto-fallback' });
    expect(probe.shows).toBe(2);
    expect(warnings(logger)).toHaveLength(2);
  });

  it('RF-401 within the back-off after a fallback, calls reuse the fallback without probing', async () => {
    const { probe, resolver, logger, clock } = resolverFor({ trained: null, fitsUpTo: 65_536 });

    await resolver.auto(gemma);
    clock.ms += FALLBACK_BACKOFF_MS - 1;
    expect(await resolver.auto(gemma)).toEqual({ tokens: 32_768, source: 'auto-fallback' });

    expect(probe.shows).toBe(1);
    expect(warnings(logger)).toHaveLength(1);
  });

  it('RF-401 a probe failure after a spill falls back to the floor, never to the size that spilled', async () => {
    const { probe, resolver, logger } = resolverFor({
      trained: 131_072,
      fitsUpTo: 16_384,
      psFailsFrom: 2,
    });

    expect(await resolver.auto(gemma)).toEqual({ tokens: 4_096, source: 'auto-fallback' });
    expect(probe.loads).toEqual([32_768, 16_384]);
    expect(warnings(logger)).toHaveLength(1);
  });

  it("RF-401 falls back within the model's trained context when /api/ps fails", async () => {
    const { resolver, logger } = resolverFor({ trained: 8_192, fitsUpTo: 65_536, psFails: true });

    expect(await resolver.auto(gemma)).toEqual({ tokens: 8_192, source: 'auto-fallback' });
    expect(warnings(logger)).toHaveLength(1);
  });
});

describe('Ollama context size cache reset', () => {
  it('RF-401 a cleared cache measures again, for test harnesses', async () => {
    const { probe, resolver, cache } = resolverFor({ trained: 131_072, fitsUpTo: 65_536 });
    await resolver.auto(gemma);
    await resolver.checkFixed(gemma, 8_192);

    clearContextCache(cache);
    await resolver.auto(gemma);
    await resolver.checkFixed(gemma, 8_192);

    expect(probe.shows).toBe(2);
    expect(probe.psReads).toBe(4);
  });

  it('RF-401 the production resolver module does not export the cache reset', () => {
    expect(Object.keys(resolverModule)).not.toContain('clearContextCache');
  });
});

describe('fixed Ollama context size', () => {
  it('RF-401 logs one warning, once per model, when the fixed size leaves part of the model on the CPU', async () => {
    const { probe, resolver, logger } = resolverFor({ trained: 131_072, fitsUpTo: 16_384 });
    probe.loads.push(32_768);

    await resolver.checkFixed(gemma, 32_768);
    await resolver.checkFixed(gemma, 32_768);

    expect(warnings(logger)).toHaveLength(1);
    expect(probe.psReads).toBe(1);
    expect(probe.loads).toEqual([32_768]);
  });

  it('RF-401 logs nothing when the fixed size keeps the whole model in GPU memory', async () => {
    const { probe, resolver, logger } = resolverFor({ trained: 131_072, fitsUpTo: 16_384 });
    probe.loads.push(8_192);

    await resolver.checkFixed(gemma, 8_192);

    expect(warnings(logger)).toEqual([]);
  });

  it('RF-401 a failed /api/ps after a fixed-size call is a warning, never a failure', async () => {
    const { resolver, logger } = resolverFor({ trained: 8_192, fitsUpTo: 1, psFails: true });

    await resolver.checkFixed(gemma, 8_192);

    expect(warnings(logger)).toHaveLength(1);
  });
});
