import type { FileEntry } from '../../domain/code-map/file-entry.js';
import type { DataBlockSource } from '../../domain/egress/data-block.js';
import type { RowSpan } from '../cards/row-citations.js';
import type { ToolCall, ToolDefinition } from '../ports/llm-provider.js';
import type { ToolCallIds, ToolOutcome } from './read-only-tools.js';

/** The tools of one task: the read-only tool set of its area (ReadOnlyTools). */
export interface AgentToolSet {
  readonly definitions: readonly ToolDefinition[];
  areaOverview(): string;
  /** RF-206: the files of the area that can be read (not skipped), as the code map spells them. */
  readableAreaFiles(): readonly string[];
  /** P3-78: the same files with their size, to count the share of the area read. */
  readableAreaEntries(): readonly FileEntry[];
  /** RF-145: text as one data block with a fresh tag of its own. */
  renderBlock(source: DataBlockSource, text: string): string;
  /** RF-202: the lines that start with each row of a rendered workbook file, or undefined when it cannot be read. */
  rowSpans(path: string): Promise<ReadonlyMap<number, RowSpan> | undefined>;
  run(call: ToolCall, ids: ToolCallIds): Promise<ToolOutcome>;
}
