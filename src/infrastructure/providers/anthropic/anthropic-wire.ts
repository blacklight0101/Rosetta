import { z } from 'zod';

// RF-404, ADR-003: the parts of Anthropic's Messages API answer the adapter reads, parsed at the
// boundary. These types never leave src/infrastructure/providers/anthropic/.

const count = z.number().int().nonnegative();

const usageSchema = z.object({
  /** The input tokens after the last cache breakpoint: neither read from nor written to the cache. */
  input_tokens: count,
  output_tokens: count,
  /** Written to the cache by this call. */
  cache_creation_input_tokens: count.nullish(),
  /** Read from the cache by this call. */
  cache_read_input_tokens: count.nullish(),
  /** The part of `output_tokens` spent on thinking; absent from older answers. */
  output_tokens_details: z.object({ thinking_tokens: count.nullish() }).nullish(),
});

const blockSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('tool_use'), id: z.string(), name: z.string(), input: z.unknown() }),
  /** Thinking and any other block the adapter does not read. */
  z.object({ type: z.string() }),
]);

const messageSchema = z.object({
  type: z.literal('message'),
  /** The model that answered (RNF-004). */
  model: z.string().min(1),
  content: z.array(blockSchema),
  stop_reason: z.string().nullish(),
  usage: usageSchema.nullish(),
});

export type AnthropicMessage = z.output<typeof messageSchema>;

/** The Messages API answer, or undefined when the body is not one. */
export function parseMessage(body: unknown): AnthropicMessage | undefined {
  const parsed = messageSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}
