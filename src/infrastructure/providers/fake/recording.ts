import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { LlmAttemptFailure, LlmResponse } from '../../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';

// ADR-008: a recording is what the fake provider replays: one entry per call, each with its
// attempts; every attempt but the last is a failure the adapter retried (RF-406). Recordings live
// under tests/recordings/, hold no secret and are reviewed like code.

export type RecordedAttempt =
  { readonly response: LlmResponse } | { readonly failure: LlmAttemptFailure };

export interface RecordedCall {
  readonly attempts: readonly RecordedAttempt[];
}

export interface Recording {
  readonly schemaVersion: 1;
  /** What the recording shows and how it was made. */
  readonly description: string;
  readonly calls: readonly RecordedCall[];
}

const count = z.number().int().nonnegative();

const usageSchema = z.strictObject({
  inputTokens: count,
  outputTokens: count,
  cachedInputTokens: count,
  usageSource: z.enum(['reported', 'estimated']),
});

const metricsSchema = z.strictObject({
  timeToFirstTokenMs: count.exactOptional(),
  httpStatus: z.number().int().exactOptional(),
  ollama: z
    .strictObject({
      loadDurationMs: count,
      promptEvalDurationMs: count,
      evalDurationMs: count,
      tokensPerSecond: z.number().nonnegative(),
    })
    .exactOptional(),
});

const responseSchema = z.strictObject({
  text: z.string(),
  toolCalls: z.array(z.strictObject({ id: z.string(), name: z.string(), arguments: z.unknown() })),
  usage: usageSchema,
  finishReason: z.enum(['stop', 'length', 'tool_use']),
  requestId: z.string().exactOptional(),
  modelVersion: z.string().min(1),
  metrics: metricsSchema.exactOptional(),
});

const failureSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  httpStatus: z.number().int().exactOptional(),
  requestId: z.string().exactOptional(),
});

const attemptSchema = z.union([
  z.strictObject({ response: responseSchema }),
  z.strictObject({ failure: failureSchema }),
]);

const callSchema = z
  .strictObject({ attempts: z.array(attemptSchema).min(1) })
  .refine(
    (call) => call.attempts.slice(0, -1).every((attempt) => 'failure' in attempt),
    'only the last attempt of a call may be an answer',
  );

const recordingSchema: z.ZodType<Recording> = z.strictObject({
  schemaVersion: z.literal(1),
  description: z.string(),
  calls: z.array(callSchema),
});

function invalid(source: string, cause: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.recordingInvalid,
    `The recording ${source} is missing or invalid.`,
    { cause },
  );
}

/** Parses a recording; `source` names it in the error (RST-1502). */
export function parseRecording(input: unknown, source: string): Recording {
  const result = recordingSchema.safeParse(input);
  if (!result.success) throw invalid(source, result.error);
  return result.data;
}

/** Reads and parses a recording file (RST-1502 when it is missing or invalid). */
export async function loadRecording(path: string): Promise<Recording> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw invalid(path, error);
  }
  return parseRecording(input, path);
}
