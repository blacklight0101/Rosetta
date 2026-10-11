import { z } from 'zod';

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
