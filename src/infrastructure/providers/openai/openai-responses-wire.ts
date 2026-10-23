import { z } from 'zod';

// P3-131, RF-402, ADR-003: the parts of OpenAI's Responses answer the adapter reads, parsed at the
// boundary. These types never leave src/infrastructure/providers/openai/.

const count = z.number().int().nonnegative();

const usageSchema = z.object({
  /** A usage may leave either count out; the missing one is estimated (RF-421). */
  input_tokens: count.optional(),
  output_tokens: count.optional(),
  input_tokens_details: z.object({ cached_tokens: count.nullish() }).nullish(),
  /** The part of `output_tokens` spent on hidden reasoning. */
  output_tokens_details: z.object({ reasoning_tokens: count.nullish() }).nullish(),
});

const contentSchema = z.object({
  type: z.string(),
  text: z.string().nullish(),
  refusal: z.string().nullish(),
});

/** An output item: `message`, `function_call`, `reasoning` or a type Rosetta ignores. */
const itemSchema = z.object({
  type: z.string(),
  content: z.array(contentSchema).nullish(),
  call_id: z.string().nullish(),
  name: z.string().nullish(),
  arguments: z.string().nullish(),
});

const responseSchema = z.object({
  /** The dated model id that answered (RNF-004). */
  model: z.string().min(1),
  status: z.string().nullish(),
  incomplete_details: z.object({ reason: z.string().nullish() }).nullish(),
  output: z.array(itemSchema),
  usage: usageSchema.nullish(),
});

export type OpenAiResponse = z.output<typeof responseSchema>;
export type ResponseItem = OpenAiResponse['output'][number];

/** The Responses answer, or undefined when the body is not one. */
export function parseResponse(body: unknown): OpenAiResponse | undefined {
  const parsed = responseSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}
