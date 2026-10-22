import { z } from 'zod';
import type { StoredCall, StoredTranscriptEntry } from '../../application/ports/run-call-reader.js';

// RF-1011, RF-408, data-model.md sections 3.10 and 3.15: the lines of `provider-calls.jsonl` and of
// a transcript as the "API calls" panel reads them. Whatever the file holds is `unknown` until
// these schemas parse it; a line that does not fit is left out by the reader.

const count = z.number().int().nonnegative();

const ollamaSchema = z.object({
  loadDurationMs: z.number().nonnegative(),
  promptEvalDurationMs: z.number().nonnegative(),
  evalDurationMs: z.number().nonnegative(),
  tokensPerSecond: z.number().nonnegative(),
  contextTokens: count.optional(),
  contextSource: z
    .enum(['auto-fit', 'auto-floor', 'auto-model-limit', 'auto-fallback', 'auto-grown', 'fixed'])
    .optional(),
});

const callSchema = z.object({
  seq: count,
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string(),
  callId: z.string(),
  attempt: count,
  runId: z.string(),
  agentTaskId: z.string(),
  role: z.enum(['reader', 'verifier', 'planner', 'summariser']),
  provider: z.string(),
  kind: z.enum(['ollama', 'openai', 'openai-compatible', 'anthropic', 'fake']),
  model: z.string(),
  modelVersion: z.string().optional(),
  endpointHost: z.string(),
  requestId: z.string().optional(),
  startedAt: z.string(),
  timeToFirstTokenMs: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  inputTokens: count,
  outputTokens: count,
  cachedInputTokens: count,
  cacheWriteInputTokens: count.optional(),
  reasoningTokens: count.optional(),
  usageSource: z.enum(['reported', 'estimated']),
  outputUnknown: z.boolean().optional(),
  costMicros: count,
  currency: z.string(),
  finishReason: z.enum(['stop', 'length', 'tool_use', 'error']),
  status: z.enum(['ok', 'retried', 'failed', 'refused-by-cap']),
  errorCode: z.string().optional(),
  httpStatus: count.optional(),
  ollama: ollamaSchema.optional(),
  transcriptRef: z.string().optional(),
});

type ParsedOllama = z.output<typeof ollamaSchema>;

function ollamaOf(parsed: ParsedOllama): NonNullable<StoredCall['ollama']> {
  const { contextTokens, contextSource, ...timings } = parsed;
  return {
    ...timings,
    ...(contextTokens === undefined ? {} : { contextTokens }),
    ...(contextSource === undefined ? {} : { contextSource }),
  };
}

/** The optional parts of the usage that the line holds. */
function usageExtras(parts: {
  readonly cacheWriteInputTokens: number | undefined;
  readonly reasoningTokens: number | undefined;
  readonly outputUnknown: boolean | undefined;
}) {
  const { cacheWriteInputTokens, reasoningTokens, outputUnknown } = parts;
  return {
    ...(cacheWriteInputTokens === undefined ? {} : { cacheWriteInputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(outputUnknown === undefined ? {} : { outputUnknown }),
  };
}

/** The attempt a line holds, or undefined when the line is not a complete record. */
// RF-408
export function parseCallLine(value: unknown): StoredCall | undefined {
  const parsed = callSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { modelVersion, requestId, errorCode, httpStatus, ollama, transcriptRef, ...rest } =
    parsed.data;
  const { cacheWriteInputTokens, reasoningTokens, outputUnknown, ...required } = rest;
  return {
    ...required,
    ...usageExtras({ cacheWriteInputTokens, reasoningTokens, outputUnknown }),
    ...(modelVersion === undefined ? {} : { modelVersion }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(ollama === undefined ? {} : { ollama: ollamaOf(ollama) }),
    ...(transcriptRef === undefined ? {} : { transcriptRef }),
  };
}

const transcriptSchema = z.object({
  seq: count,
  at: z.string(),
  callId: z.string(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCalls: z
    .array(z.object({ id: z.string(), name: z.string(), arguments: z.unknown() }))
    .optional(),
});

/** The message a transcript line holds, or undefined when the line is not a complete entry. */
// RF-408
export function parseTranscriptLine(value: unknown): StoredTranscriptEntry | undefined {
  const parsed = transcriptSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { toolCalls, ...entry } = parsed.data;
  return {
    ...entry,
    ...(toolCalls === undefined
      ? {}
      : {
          toolCalls: toolCalls.map((call) => ({
            id: call.id,
            name: call.name,
            arguments: call.arguments,
          })),
        }),
  };
}
