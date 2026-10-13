import { expect } from 'vitest';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { ReadOnlyTools, type ToolOutcome } from '../../src/application/agent/read-only-tools.js';
import type { ToolLimits } from '../../src/application/agent/tool-limits.js';
import type { ToolCall } from '../../src/application/ports/llm-provider.js';
import type { Citation } from '../../src/domain/cards/citation.js';
import { scanDataBlocks } from '../../src/domain/egress/data-block-scan.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { agentCodeMap, agentFiles, ordersArea } from './agent-fixtures.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { MemoryRepositoryReader } from './memory-repository-reader.js';

// RF-201: the reader's tools over the in-memory code map and files of agent-fixtures.ts.

const context = { runId: 'run-1', agentTaskId: 'task-orders', callId: 'run-1#1' };

export interface ToolsSetup {
  readonly reader: MemoryRepositoryReader;
  readonly logger: MemoryLogger;
  readonly tools: ReadOnlyTools;
  readonly run: (name: string, args: unknown) => Promise<ToolOutcome>;
}

export interface ToolBlock {
  readonly header: string;
  readonly excerpts: readonly Citation[];
  readonly text: string;
}

export function toolsSetup(
  limits: Partial<ToolLimits> = {},
  files: Readonly<Record<string, string>> = agentFiles,
): ToolsSetup {
  const reader = new MemoryRepositoryReader(files);
  const logger = new MemoryLogger(new FixedClock('2026-10-12T09:00:00.000Z'), new SecretMasker());
  const tools = new ReadOnlyTools({
    reader,
    codeMap: agentCodeMap,
    area: ordersArea,
    logger,
    limits,
    ids: new SequenceIdGenerator(),
  });
  const run = (name: string, args: unknown) =>
    tools.run({ id: 'call-1', name, arguments: args } satisfies ToolCall, context);
  return { reader, logger, tools, run };
}

/** The one data block of a tool result: its header line, its excerpts and its content text. */
export function blockOf(content: string): ToolBlock {
  const scan = scanDataBlocks(content);
  if (!scan.ok) throw new Error('not a data block');
  expect(scan.value.blocks).toBe(1);
  expect(scan.value.textOutside).toBe(false);
  const text = scan.value.parts
    .filter((part) => !part.frame)
    .map((part) => part.text)
    .join('\n');
  const header = content.split('\n')[0] ?? '';
  return { excerpts: scan.value.excerpts, text, header };
}
