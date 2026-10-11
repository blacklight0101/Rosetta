import { z } from 'zod';
import type { Residency } from './ollama-context-resolver.js';

// RF-401, ADR-003: the parts of Ollama's HTTP API the adapter reads, parsed at the boundary.
// These types never leave src/infrastructure/providers/ollama/.

const count = z.number().int().nonnegative();
/** Ollama reports durations in nanoseconds. */
const nanoseconds = z.number().nonnegative();

const chatSchema = z.object({
  message: z.object({
    content: z.string().default(''),
    /** Thinking text of models that separate it; never part of the answer. */
    thinking: z.string().optional(),
    tool_calls: z.array(z.unknown()).optional(),
  }),
  done_reason: z.string().optional(),
  prompt_eval_count: count.optional(),
  eval_count: count.optional(),
  load_duration: nanoseconds.optional(),
  prompt_eval_duration: nanoseconds.optional(),
  eval_duration: nanoseconds.optional(),
});

export type OllamaChat = z.input<typeof chatSchema>;

const tagsSchema = z.object({
  models: z.array(z.object({ name: z.string(), digest: z.string() })),
});

const errorSchema = z.object({ error: z.string() });

/** /api/show: `model_info` holds `<architecture>.context_length`, the trained context. */
const showSchema = z.object({ model_info: z.record(z.string(), z.unknown()) });

/** /api/ps: the loaded models, with their total size and the part of it in GPU memory. */
const psSchema = z.object({
  models: z.array(z.object({ digest: z.string(), size: count, size_vram: count })),
});

const contextLength = z.number().int().positive();

/** The /api/chat answer, or undefined when the body is not one. */
export function parseChat(body: unknown): z.output<typeof chatSchema> | undefined {
  const parsed = chatSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

/** The digest of `model` in the /api/tags answer; `name` without a tag means `name:latest`. */
export function digestOf(body: unknown, model: string): string | undefined {
  const parsed = tagsSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const names = model.includes(':') ? [model] : [model, `${model}:latest`];
  return parsed.data.models.find((entry) => names.includes(entry.name))?.digest;
}

/** The text of an Ollama error body (`{ "error": "..." }`), or ''. */
export function errorText(body: unknown): string {
  const parsed = errorSchema.safeParse(body);
  return parsed.success ? parsed.data.error : '';
}

/**
 * The model's trained context from /api/show: `<general.architecture>.context_length`, else the
 * first `*.context_length`; `trained` is undefined when none is named, `ok` false when the body is
 * not a /api/show answer.
 */
export function trainedContextOf(
  body: unknown,
): { readonly ok: true; readonly trained: number | undefined } | { readonly ok: false } {
  const parsed = showSchema.safeParse(body);
  if (!parsed.success) return { ok: false };
  const info = parsed.data.model_info;
  const architecture = info['general.architecture'];
  const own = typeof architecture === 'string' ? info[`${architecture}.context_length`] : undefined;
  const any = Object.entries(info).find(([key]) => key.endsWith('.context_length'))?.[1];
  const trained = contextLength.safeParse(own ?? any);
  return { ok: true, trained: trained.success ? trained.data : undefined };
}

/** The loaded model with `digest` in the /api/ps answer, or undefined when it is not loaded. */
export function residencyOf(body: unknown, digest: string): Residency | undefined {
  const parsed = psSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const loaded = parsed.data.models.find((entry) => entry.digest === digest);
  return loaded === undefined ? undefined : { size: loaded.size, sizeVram: loaded.size_vram };
}
