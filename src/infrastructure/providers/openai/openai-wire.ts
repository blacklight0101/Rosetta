import { z } from 'zod';

// RF-402, ADR-003: the parts of OpenAI's chat completion answer the adapter reads, parsed at the
// boundary. These types never leave src/infrastructure/providers/openai/.

const count = z.number().int().nonnegative();

const usageSchema = z.object({
  /** A usage may leave either count out; the missing one is estimated (RF-421). */
  prompt_tokens: count.optional(),
  completion_tokens: count.optional(),
  /** Left out by older models and by some compatible services. */
  prompt_tokens_details: z.object({ cached_tokens: count.nullish() }).nullish(),
});

const choiceSchema = z.object({
  message: z.object({
    content: z.string().nullish(),
    refusal: z.string().nullish(),
    tool_calls: z.array(z.unknown()).nullish(),
  }),
  finish_reason: z.string().nullish(),
});

const completionSchema = z.object({
  /** The dated model id that answered (RNF-004). */
  model: z.string().min(1),
  choices: z.array(choiceSchema).min(1),
  usage: usageSchema.nullish(),
});

export type OpenAiCompletion = z.output<typeof completionSchema>;

/** The chat completion answer, or undefined when the body is not one. */
export function parseCompletion(body: unknown): OpenAiCompletion | undefined {
  const parsed = completionSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}
