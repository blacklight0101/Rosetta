import type { ProviderCallRecord } from '../../src/application/ports/provider-call-recorder.js';
import type { OutputWriter } from '../../src/application/ports/output-writer.js';
import type { Run } from '../../src/domain/runs/run.js';
import { sampleRecord } from '../contracts/provider-call-recorder.contract.js';

// RF-1011, RF-408: provider call records and transcripts in a run folder, for tests of the "API
// calls" panel. The files are written as the recorder writes them (data-model.md 3.10, 3.15).

/** An answered attempt of an OpenAI model; a test overrides what it needs. */
export function cloudCall(
  run: Pick<Run, 'runKey'>,
  overrides: Partial<ProviderCallRecord> = {},
): ProviderCallRecord {
  return {
    traceId: sampleRecord.traceId,
    spanId: sampleRecord.spanId,
    parentSpanId: sampleRecord.parentSpanId,
    callId: `${run.runKey}#1`,
    attempt: 1,
    runId: run.runKey,
    agentTaskId: 'reader-001',
    role: 'verifier',
    provider: 'cloud',
    kind: 'openai',
    model: 'gpt-test',
    endpointHost: 'api.openai.com',
    startedAt: sampleRecord.startedAt,
    timeToFirstTokenMs: 800,
    latencyMs: 1700,
    inputTokens: 2000,
    outputTokens: 180,
    cachedInputTokens: 0,
    usageSource: 'reported',
    costMicros: 6100,
    currency: 'USD',
    finishReason: 'stop',
    status: 'ok',
    ...overrides,
  };
}

/** An answered attempt of a local Ollama model, with Ollama's timings and a transcript link. */
export function localCall(
  run: Pick<Run, 'runKey'>,
  overrides: Partial<ProviderCallRecord> = {},
): ProviderCallRecord {
  return {
    ...cloudCall(run),
    role: 'reader',
    provider: 'local',
    kind: 'ollama',
    model: sampleRecord.model,
    endpointHost: sampleRecord.endpointHost,
    timeToFirstTokenMs: sampleRecord.timeToFirstTokenMs,
    latencyMs: sampleRecord.latencyMs,
    inputTokens: sampleRecord.inputTokens,
    outputTokens: sampleRecord.outputTokens,
    costMicros: 0,
    ollama: { loadDurationMs: 10, promptEvalDurationMs: 300, evalDurationMs: 900, tokensPerSecond: 42 },
    transcriptRef: 'transcripts/task-1.jsonl#1',
    ...overrides,
  };
}

function folderOf(run: Pick<Run, 'projectId' | 'runKey'>): string {
  return `projects/${run.projectId}/runs/${run.runKey}`;
}

/** Appends the records to the run's `provider-calls.jsonl` with `seq` counting from 1 (or `first`). */
export async function seedCallLog(
  writer: Pick<OutputWriter, 'appendLine'>,
  run: Pick<Run, 'userId' | 'projectId' | 'runKey'>,
  records: readonly ProviderCallRecord[],
  first = 1,
): Promise<void> {
  for (const [index, record] of records.entries()) {
    const line = JSON.stringify({ schemaVersion: 1, seq: first + index, ...record });
    await writer.appendLine(
      { userId: run.userId, path: `${folderOf(run)}/provider-calls.jsonl` },
      line,
    );
  }
}

export interface SeededMessage {
  readonly callId: string;
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
}

/** Appends messages to the run's transcript of one agent task with `seq` counting from 1. */
export async function seedTranscript(
  writer: Pick<OutputWriter, 'appendLine'>,
  run: Pick<Run, 'userId' | 'projectId' | 'runKey'>,
  agentTaskId: string,
  messages: readonly SeededMessage[],
): Promise<void> {
  for (const [index, message] of messages.entries()) {
    const line = JSON.stringify({
      schemaVersion: 1,
      seq: index + 1,
      at: sampleRecord.startedAt,
      ...message,
    });
    await writer.appendLine(
      { userId: run.userId, path: `${folderOf(run)}/transcripts/${agentTaskId}.jsonl` },
      line,
    );
  }
}
