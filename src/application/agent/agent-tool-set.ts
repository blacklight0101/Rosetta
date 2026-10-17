import type { DataBlockSource } from '../../domain/egress/data-block.js';
import type { ToolCall, ToolDefinition } from '../ports/llm-provider.js';
import type { ToolCallIds, ToolOutcome } from './read-only-tools.js';

/** The tools of one task: the read-only tool set of its area (ReadOnlyTools). */
export interface AgentToolSet {
  readonly definitions: readonly ToolDefinition[];
  areaOverview(): string;
  /** RF-206: the files of the area that can be read (not skipped), as the code map spells them. */
  readableAreaFiles(): readonly string[];
  /** RF-145: text as one data block with a fresh tag of its own. */
  renderBlock(source: DataBlockSource, text: string): string;
  run(call: ToolCall, ids: ToolCallIds): Promise<ToolOutcome>;
}
