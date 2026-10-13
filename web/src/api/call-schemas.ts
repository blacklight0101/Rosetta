import { z } from 'zod';

// RF-1011, RF-408, observability-routes.ts: the wire shapes of the calls, transcript and logs routes.

const count = z.number().int().nonnegative();
const percentile = count.nullable();

export const CALL_STATUSES = ['ok', 'retried', 'failed', 'refused-by-cap'] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const callSchema = z.object({
  seq: count,
  callId: z.string(),
  attempt: count,
  startedAt: z.string(),
  agentTaskId: z.string(),
  agent: z.string(),
  role: z.string(),
  provider: z.string(),
  kind: z.string(),
  model: z.string(),
  endpointHost: z.string(),
  timeToFirstTokenMs: count,
  latencyMs: count,
  inputTokens: count,
  outputTokens: count,
  cachedInputTokens: count,
  costMicros: count,
  currency: z.string(),
  finishReason: z.string(),
  status: z.enum(CALL_STATUSES),
  errorCode: z.string().optional(),
  httpStatus: count.optional(),
  ollama: z
    .looseObject({
      loadDurationMs: count,
      promptEvalDurationMs: count,
      evalDurationMs: count,
      tokensPerSecond: z.number().nonnegative(),
    })
    .optional(),
  hasTranscript: z.boolean(),
});

export type CallRow = z.output<typeof callSchema>;

export const summarySchema = z.object({
  provider: z.string(),
  role: z.string(),
  calls: count,
  retried: count,
  failed: count,
  refused: count,
  errors: count,
  latencyP50Ms: percentile,
  latencyP95Ms: percentile,
  firstTokenP50Ms: percentile,
  firstTokenP95Ms: percentile,
  tokensPerSecond: z.number().nonnegative().nullable(),
  inputTokens: count,
  outputTokens: count,
  costMicros: count,
});

export type SummaryRow = z.output<typeof summarySchema>;

const runState = z.enum(['Queued', 'Running', 'Ended']);

export const callsSchema = z.object({
  runKey: z.string(),
  runState,
  total: count,
  calls: z.array(callSchema),
  summary: z.array(summarySchema),
});

export type RunCalls = z.output<typeof callsSchema>;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const logEntrySchema = z.object({
  at: z.string(),
  level: z.enum(LOG_LEVELS),
  logger: z.string(),
  message: z.string(),
  code: z.string().optional(),
  agentTaskId: z.string().optional(),
  callId: z.string().optional(),
});

export type LogRow = z.output<typeof logEntrySchema>;

export const logsSchema = z.object({
  runKey: z.string(),
  runState,
  total: count,
  entries: z.array(logEntrySchema),
  counts: z.record(z.string(), count),
  securityEvents: count,
});

export type RunLogs = z.output<typeof logsSchema>;

export const transcriptEntrySchema = z.object({
  seq: count,
  at: z.string(),
  callId: z.string(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCalls: z
    .array(z.object({ id: z.string(), name: z.string(), arguments: z.unknown() }))
    .optional(),
});

export type TranscriptRow = z.output<typeof transcriptEntrySchema>;

export const transcriptSchema = z
  .looseObject({ entries: z.array(transcriptEntrySchema) })
  .transform((body) => body.entries);
