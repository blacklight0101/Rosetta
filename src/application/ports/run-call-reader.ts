import type { ProviderRoleSummary } from '../../domain/observability/call-stats.js';
import type { ToolCall } from './llm-provider.js';
import type { ProviderCallRecord } from './provider-call-recorder.js';
import type { RunScope } from './run-events.js';

// RF-1011, RF-408, data-model.md sections 3.10 and 3.15: what the "API calls" panel reads back from
// a run folder. Every value is masked once more when it is read (RNF-003), and a record that does
// not parse is left out, so a damaged line never hides the others.

/**
 * One attempt of the provider call log with the `seq` the recorder gave it. The error code is the
 * text on the line: a log written by a newer release may hold a code this one does not know.
 */
export interface StoredCall extends Omit<ProviderCallRecord, 'errorCode'> {
  readonly seq: number;
  readonly errorCode?: string;
}

/** One message of an agent task's masked transcript. */
export interface StoredTranscriptEntry {
  readonly seq: number;
  readonly at: string;
  readonly callId: string;
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
}

/** P5-22: a run's call log as parsed once; the same object answers every read of one version. */
export interface RunCallLog {
  /** The attempts in `seq` order. */
  readonly calls: readonly StoredCall[];
  /** The summary per provider and role over every attempt, computed once. */
  readonly summary: readonly ProviderRoleSummary[];
  find(seq: number): StoredCall | undefined;
  /** At most `limit` attempts with a `seq` after `after` (0 for the start), in order. */
  page(after: number, limit: number): readonly StoredCall[];
}

export interface RunCallReader {
  /** P5-22: the parsed call log of the run; empty for a run without one. */
  log(scope: RunScope): Promise<RunCallLog>;
  /** The messages of one agent task's transcript; empty when there is none. */
  transcript(scope: RunScope, agentTaskId: string): Promise<readonly StoredTranscriptEntry[]>;
}
