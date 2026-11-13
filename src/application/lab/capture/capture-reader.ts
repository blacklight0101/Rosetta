import { readDataBlocks, type ReadDataBlock } from './data-blocks.js';
import type { TranscriptTask } from './capture-types.js';

// RF-1404, RF-1406: the inputs of the reader's prompts from the task of a reader agent: the list of
// the area's files (the first user message) and, for the card format, the first small excerpts the
// reader read. What the model wrote (tool calls, answers) is never kept: a read is replayed from the
// path and the lines it names, which the tool gave back.

export const readerPromptIds: readonly string[] = [
  'reader/task',
  'reader/area',
  'reader/read-first',
  'cards/card-format',
];

/** Small on purpose: the committed excerpts of public code stay short. */
const MAX_READS = 2;
const MAX_READ_LINES = 40;
const MAX_LINE_CHARS = 300;

interface AreaFile {
  readonly path: string;
  readonly language: string;
  readonly lines?: number;
  readonly skipped?: string;
}

const fileLine = /^(.+) \(([^,()]+), (?:(\d+) lines|skipped: ([^)]*))\)$/u;

function fileOf(line: string): AreaFile | undefined {
  const match = fileLine.exec(line);
  const [, path, language, lines, skipped] = match ?? [];
  if (path === undefined || language === undefined) return undefined;
  if (lines !== undefined) return { path, language, lines: Number(lines) };
  return skipped === undefined ? undefined : { path, language, skipped };
}

function areaOf(block: ReadDataBlock | undefined): { area: string; files: AreaFile[] } | undefined {
  if (block?.source !== 'list_area_files') return undefined;
  const lines = block.text.split('\n');
  const area = lines[0]?.startsWith('area: ') === true ? lines[0].slice('area: '.length) : '';
  const files = lines.flatMap((line) => fileOf(line) ?? []);
  return area === '' || files.length === 0 ? undefined : { area, files };
}

const numbered = /^(\d+): (.*)$/u;

interface Read {
  readonly path: string;
  readonly startLine: number;
  readonly lines: readonly string[];
}

function readOf(block: ReadDataBlock): Read | undefined {
  const [excerpt] = block.excerpts;
  if (block.source !== 'read_file' || excerpt === undefined) return undefined;
  const lines: string[] = [];
  for (const line of block.text.split('\n')) {
    const match = numbered.exec(line);
    if (match === null || Number(match[1]) !== excerpt.startLine + lines.length) break;
    lines.push((match[2] ?? '').slice(0, MAX_LINE_CHARS));
    if (lines.length === MAX_READ_LINES) break;
  }
  return lines.length === 0
    ? undefined
    : { path: excerpt.path, startLine: excerpt.startLine, lines };
}

function readsOf(task: TranscriptTask): Read[] {
  const tools = task.messages.filter((message) => message.role === 'tool');
  const reads = tools.flatMap((message) => readDataBlocks(message.content).map(readOf));
  return reads.flatMap((read) => read ?? []).slice(0, MAX_READS);
}

// RF-1404
export function captureReaderInput(
  promptId: string,
  task: TranscriptTask,
  context: { readonly maxTurns: number },
): unknown {
  if (!readerPromptIds.includes(promptId) || !/^reader-\d+$/u.test(task.name)) return undefined;
  const first = task.messages.find((message) => message.role === 'user');
  const area = areaOf(first === undefined ? undefined : readDataBlocks(first.content)[0]);
  if (area === undefined) return undefined;
  const workbook = area.files.some((file) => file.path.endsWith('/workbook.md'));
  const base = { ...area, ...(workbook ? { workbook } : {}), turns: context.maxTurns };
  if (promptId !== 'cards/card-format') return base;
  const reads = readsOf(task);
  return reads.length === 0 ? undefined : { ...base, reads };
}
