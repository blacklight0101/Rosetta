import type { Citation } from '../../domain/cards/citation.js';
import type { AgentRole } from './llm-provider.js';

// RF-142, ADR-006, data-model.md section 3.11: `egress.log.jsonl` in the run folder, one line per
// model call the egress guard let through: where it went and which excerpts it carried. It never
// holds the text of an excerpt or a secret.

/** One call, without `schemaVersion` and `seq`, which the log adds. */
export interface EgressRecord {
  readonly at: string;
  readonly callId: string;
  /** The provider's name in the project settings. */
  readonly provider: string;
  readonly model: string;
  readonly role: AgentRole;
  readonly agentTaskId: string;
  /** The path and line range of every file excerpt the call carried, in message order. */
  readonly excerpts: readonly Citation[];
  /** Secrets masked in this call's request, per kind (RF-141). */
  readonly maskedCounts: Readonly<Record<string, number>>;
}

export interface EgressLog {
  /**
   * Appends one masked line; `seq` counts the lines of the run from 1 without gaps and continues
   * after the complete lines the file already holds (RF-006). Rejects with RST-2107 when the line
   * cannot be stored.
   */
  append(record: EgressRecord): Promise<void>;
}
