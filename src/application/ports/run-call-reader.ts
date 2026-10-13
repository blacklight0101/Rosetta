import type { ProviderCallRecord } from './provider-call-recorder.js';
import type { RunScope } from './run-events.js';
import type { ToolCall } from './llm-provider.js';

// RF-1011, RF-408, data-model.md sections 3.10 and 3.15: what the "API calls" panel reads back from
// a run folder. Every value is masked once more when it is read (RNF-003), and a record that does
// not parse is left out, so a damaged line never hides the others.

/** One attempt of the provider call log with the `seq` the recorder gave it. */
export interface StoredCall extends ProviderCallRecord {
  readonly seq: number;
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

export interface RunCallReader {
  /** The attempts of the run in `seq` order; empty for a run without a call log. */
  calls(scope: RunScope): Promise<readonly StoredCall[]>;
  /** The messages of one agent task's transcript; empty when there is none. */
  transcript(scope: RunScope, agentTaskId: string): Promise<readonly StoredTranscriptEntry[]>;
}
