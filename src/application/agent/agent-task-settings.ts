import type { AgentRole } from '../ports/llm-provider.js';

// RF-201, ADR-003: what the reader's loop is told about its model and about who is asking.

export interface AgentTaskSettings {
  readonly model: string;
  /** Model calls before the task ends as `TurnLimitReached` (RF-201). */
  readonly maxTurns: number;
  /** The model's context in tokens. */
  readonly contextTokens: number;
  /** The share of the context the conversation may reach, for example 0.8. */
  readonly contextShare: number;
  readonly maxOutputTokens?: number;
  readonly maxOutputCeiling?: number;
  readonly temperature?: number;
}

export interface AgentTaskContext {
  readonly runId: string;
  readonly agentTaskId: string;
  readonly role: AgentRole;
  readonly traceId: string;
  readonly parentSpanId: string;
}
