import type { ErrorCode } from '../../domain/errors/codes.js';
import type {
  AgentRole,
  FinishReason,
  OllamaMetrics,
  ProviderKind,
  ToolCall,
  UsageSource,
} from './llm-provider.js';

// RF-408, DEC-50: one record per provider call attempt in `provider-calls.jsonl`, and the masked
// messages of each agent task in `transcripts/<agentTaskId>.jsonl` (data-model.md 3.10, 3.15).

export type ProviderCallStatus = 'ok' | 'retried' | 'failed' | 'refused-by-cap';

/** One attempt, without `schemaVersion` and `seq`, which the recorder adds. */
export interface ProviderCallRecord {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string;
  readonly callId: string;
  readonly attempt: number;
  readonly runId: string;
  readonly agentTaskId: string;
  readonly role: AgentRole;
  readonly provider: string;
  readonly kind: ProviderKind;
  readonly model: string;
  readonly modelVersion?: string;
  readonly endpointHost: string;
  readonly requestId?: string;
  readonly startedAt: string;
  readonly timeToFirstTokenMs: number;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  /** The part of `inputTokens` written to the provider's prompt cache (P2-37); absent when none. */
  readonly cacheWriteInputTokens?: number;
  /** Q-58: the part of `outputTokens` spent on reasoning (OpenAI, Anthropic); absent when not reported. */
  readonly reasoningTokens?: number;
  readonly usageSource: UsageSource;
  /** Q-60: a timed-out attempt; the output counts only what arrived. */
  readonly outputUnknown?: boolean;
  readonly costMicros: number;
  readonly currency: string;
  readonly finishReason: FinishReason;
  readonly status: ProviderCallStatus;
  readonly errorCode?: ErrorCode;
  readonly httpStatus?: number;
  readonly ollama?: OllamaMetrics;
  readonly transcriptRef?: string;
}

/** One message of a transcript, without `schemaVersion` and `seq`. */
export interface TranscriptEntry {
  readonly at: string;
  readonly callId: string;
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
}

export interface ProviderCallRecorder {
  /**
   * Appends one masked record; `seq` counts the records of the run from 1 and continues after the
   * records already in the run folder (RF-006).
   */
  record(call: ProviderCallRecord): Promise<void>;
  /**
   * Appends masked entries to the agent task's transcript, `seq` counting its lines from 1, and
   * returns the link to the first one: `transcripts/<agentTaskId>.jsonl#<seq>`.
   */
  transcript(agentTaskId: string, entries: readonly TranscriptEntry[]): Promise<string>;
}
