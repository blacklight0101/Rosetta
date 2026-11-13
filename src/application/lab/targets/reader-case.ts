import { z } from 'zod';
import { renderDataBlock } from '../../../domain/egress/data-block.js';
import type { LlmMessage } from '../../ports/llm-provider.js';
import { turnsLeftMessage, type ReaderPrompts } from '../../agent/reader-prompts.js';

// RF-1406, ADR-029: the case of a reader prompt. A reader is an agent loop; the lab measures one
// turn of it, so a case holds what that turn is built from: the area's file list (the first user
// message of a task carries it as the `list_area_files` block), the turns the task has, and, for
// the card format, the first small excerpts the reader read, replayed as a `read_file` turn.
// Nothing the model wrote is in a case: the replayed calls are made from the paths and lines.

const fileSchema = z.strictObject({
  path: z.string().min(1).max(400),
  language: z.string().min(1).max(40),
  lines: z.number().int().min(0).max(10_000_000).optional(),
  skipped: z.string().max(100).optional(),
});

const readSchema = z.strictObject({
  path: z.string().min(1).max(400),
  startLine: z.number().int().min(1),
  lines: z.array(z.string().max(300)).min(1).max(60),
});

export const readerCaseSchema = z.strictObject({
  area: z.string().min(1).max(300),
  files: z.array(fileSchema).min(1).max(500),
  /** The area holds a rendered workbook, so the reader gets the workbook guidance and formats. */
  workbook: z.boolean().optional(),
  /** The turns the task has; the replay and the refusal count from it. */
  turns: z.number().int().min(2).max(100).default(12),
  reads: z.array(readSchema).max(5).optional(),
});

export type ReaderCase = z.infer<typeof readerCaseSchema>;
type Read = NonNullable<ReaderCase['reads']>[number];

/** The text of the `list_area_files` block, as the run's tool writes it. */
function areaText(input: ReaderCase): string {
  const files = input.files.map((file) => {
    const facts =
      file.skipped === undefined ? `${String(file.lines ?? 0)} lines` : `skipped: ${file.skipped}`;
    return `${file.path} (${file.language}, ${facts})`;
  });
  return [`area: ${input.area}`, `files: ${String(input.files.length)}`, ...files].join('\n');
}

export const areaBlock = (input: ReaderCase, tag: string): string =>
  renderDataBlock({ source: 'list_area_files', excerpts: [], text: areaText(input) }, tag);

const MAX_LISTED = 20;

/** What the read-first refusal lists: the readable files, the first twenty. */
export function unreadBlock(input: ReaderCase, tag: string): string {
  const paths = input.files.filter((file) => file.skipped === undefined).map((file) => file.path);
  const more = paths.length - MAX_LISTED;
  const shown = [
    ...paths.slice(0, MAX_LISTED),
    ...(more > 0 ? [`... and ${String(more)} more files`] : []),
  ];
  return renderDataBlock({ source: 'list_area_files', excerpts: [], text: shown.join('\n') }, tag);
}

const excerptOf = (read: Read) => ({
  path: read.path,
  startLine: read.startLine,
  endLine: read.startLine + read.lines.length - 1,
});

/** An assistant turn that read the excerpts, the tool results, and the turns-left message. */
export function replayOfReads(
  input: ReaderCase,
  prompts: ReaderPrompts,
  tag: () => string,
): LlmMessage[] {
  const reads = input.reads ?? [];
  if (reads.length === 0) return [];
  const calls = reads.map((read, index) => ({
    id: `lab-read-${String(index + 1)}`,
    name: 'read_file',
    arguments: excerptOf(read),
  }));
  const results = reads.map((read, index): LlmMessage => {
    const text = read.lines.map((line, at) => `${String(read.startLine + at)}: ${line}`).join('\n');
    const block = renderDataBlock(
      { source: 'read_file', excerpts: [excerptOf(read)], text },
      tag(),
    );
    return { role: 'tool', toolCallId: `lab-read-${String(index + 1)}`, content: block };
  });
  const left = turnsLeftMessage(prompts, Math.max(1, input.turns - 1));
  return [
    { role: 'assistant', content: '', toolCalls: calls },
    ...results,
    { role: 'user', content: left },
  ];
}
