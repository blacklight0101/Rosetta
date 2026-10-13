import type { Logger, LogValue } from '../../../application/ports/logger.js';
import {
  CONTEXT_CEILING,
  CONTEXT_FLOOR,
  FALLBACK_BACKOFF_MS,
  type ContextChoice,
} from './ollama-context.js';

// RF-401, DEC-114, Q-23: the automatic Ollama context size. Ollama exposes no total GPU memory, so
// the resolver loads the model at a size and reads /api/ps: while part of the model is outside GPU
// memory (`size_vram < size`) it halves the size and loads again, down to the floor. The result is
// cached per Ollama server and model digest for the life of the process; a fallback is reused only
// for a short back-off, then Ollama is probed again (P1-69).

/** A model as Ollama knows it: the configured name and the digest from /api/tags. */
export interface ModelRef {
  readonly model: string;
  readonly digest: string;
}

export type ProbeResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/** A loaded model's size and the part of it in GPU memory, in bytes (from /api/ps). */
export interface Residency {
  readonly size: number;
  readonly sizeVram: number;
}

/** The Ollama calls the resolver needs; HttpContextProbe in production. */
export interface ContextProbe {
  /** The model's trained context from /api/show; undefined when it names none. */
  trainedContext(model: string): Promise<ProbeResult<number | undefined>>;
  /** Loads the model with `num_ctx` set to `tokens`, evaluating nothing. */
  load(model: string, tokens: number): Promise<ProbeResult<undefined>>;
  residency(ref: ModelRef): Promise<ProbeResult<Residency>>;
}

export interface ContextCache {
  /** Automatic choices by server and digest; a pending entry is shared by concurrent calls. */
  readonly auto: Map<string, Promise<ContextChoice>>;
  /** When a cached fallback stops being reused, in milliseconds since the epoch, by key. */
  readonly retryAt: Map<string, number>;
  /** Server, digest and size of the fixed sizes already checked for a spill. */
  readonly fixedChecked: Set<string>;
}

export function newContextCache(): ContextCache {
  return { auto: new Map(), retryAt: new Map(), fixedChecked: new Set() };
}

/** Forgets every measurement, so a test harness starts each test from an empty cache. */
export function clearContextCache(cache: ContextCache): void {
  cache.auto.clear();
  cache.retryAt.clear();
  cache.fixedChecked.clear();
}

/** The cache every Ollama provider of this process shares (DEC-114: once per process). */
export const processContextCache: ContextCache = newContextCache();

export interface ContextResolverDeps {
  /** The Ollama base URL, part of the cache key. */
  readonly serverUrl: string;
  readonly probe: ContextProbe;
  readonly logger: Logger;
  readonly cache: ContextCache;
  /** The current time in milliseconds, for the back-off after a fallback. */
  readonly now: () => number;
}

const spills = (residency: Residency): boolean => residency.sizeVram < residency.size;

// RF-401: picks and caches the context size of each Ollama model, and checks fixed sizes once.
export class OllamaContextResolver {
  private readonly deps: ContextResolverDeps;

  constructor(deps: ContextResolverDeps) {
    this.deps = deps;
  }

  /**
   * The automatic size for `ref`; never rejects: a probe failure falls back with a warning, and
   * the fallback is reused until the back-off ends.
   */
  auto(ref: ModelRef): Promise<ContextChoice> {
    const { cache, now } = this.deps;
    const key = this.keyOf(ref);
    const known = cache.auto.get(key);
    const retryAt = cache.retryAt.get(key);
    if (known !== undefined && (retryAt === undefined || now() < retryAt)) return known;
    cache.retryAt.delete(key);
    const pending = this.measure(ref).then(
      (choice) => {
        if (choice.source === 'auto-fallback') cache.retryAt.set(key, now() + FALLBACK_BACKOFF_MS);
        return choice;
      },
      (error: unknown) => {
        cache.auto.delete(key);
        throw error;
      },
    );
    cache.auto.set(key, pending);
    return pending;
  }

  /** After the first call at a fixed size: one warning when part of the model is on the CPU. */
  async checkFixed(ref: ModelRef, tokens: number): Promise<void> {
    const key = `${this.keyOf(ref)} ${String(tokens)}`;
    if (this.deps.cache.fixedChecked.has(key)) return;
    this.deps.cache.fixedChecked.add(key);
    const residency = await this.deps.probe.residency(ref);
    if (!residency.ok) {
      await this.warn(`Could not check whether ${ref.model} fits in GPU memory.`, {
        model: ref.model,
        reason: residency.reason,
      });
    } else if (spills(residency.value)) {
      await this.warn(
        `contextTokens ${String(tokens)} leaves part of ${ref.model} on the CPU, which is slower; lower contextTokens or set it to auto.`,
        { model: ref.model, contextSize: tokens, ...bytes(residency.value) },
      );
    }
  }

  /**
   * Halves from the start while the model spills. A probe failure before any spill falls back to
   * the start; after a spill no size is known to fit, so it falls back to the floor (P1-69).
   */
  private async measure(ref: ModelRef): Promise<ContextChoice> {
    const trained = await this.deps.probe.trainedContext(ref.model);
    if (!trained.ok) return this.fallback(ref, CONTEXT_CEILING, trained.reason);
    const limit = trained.value;
    const start = limit === undefined ? CONTEXT_CEILING : Math.min(limit, CONTEXT_CEILING);
    for (let tokens = start; ; tokens = Math.max(CONTEXT_FLOOR, Math.floor(tokens / 2))) {
      const residency = await this.loadedAt(ref, tokens);
      if (!residency.ok) {
        const safe = tokens === start ? start : CONTEXT_FLOOR;
        return this.fallback(ref, safe, residency.reason);
      }
      if (!spills(residency.value)) {
        const capped = tokens === limit && tokens < CONTEXT_CEILING;
        return { tokens, source: capped ? 'auto-model-limit' : 'auto-fit' };
      }
      if (tokens <= CONTEXT_FLOOR) return this.floor(ref, tokens, residency.value);
    }
  }

  private async loadedAt(ref: ModelRef, tokens: number): Promise<ProbeResult<Residency>> {
    const loaded = await this.deps.probe.load(ref.model, tokens);
    return loaded.ok ? this.deps.probe.residency(ref) : loaded;
  }

  private async floor(ref: ModelRef, tokens: number, residency: Residency): Promise<ContextChoice> {
    await this.warn(
      `Even ${String(tokens)} context tokens leave part of ${ref.model} on the CPU, which is slower; using ${String(tokens)}.`,
      { model: ref.model, contextSize: tokens, ...bytes(residency) },
    );
    return { tokens, source: 'auto-floor' };
  }

  private async fallback(ref: ModelRef, tokens: number, reason: string): Promise<ContextChoice> {
    await this.warn(
      `Could not measure the context size for ${ref.model}; using ${String(tokens)} tokens and measuring again shortly.`,
      { model: ref.model, contextSize: tokens, reason },
    );
    return { tokens, source: 'auto-fallback' };
  }

  private async warn(message: string, data: Record<string, LogValue>): Promise<void> {
    await this.deps.logger.log({ level: 'warn', logger: 'ollama', message, data });
  }

  private keyOf(ref: ModelRef): string {
    return `${this.deps.serverUrl} ${ref.digest}`;
  }
}

function bytes(residency: Residency): Record<string, LogValue> {
  return { sizeBytes: residency.size, sizeVramBytes: residency.sizeVram };
}
