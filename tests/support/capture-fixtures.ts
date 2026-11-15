import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CapturedRun,
  TranscriptMessage,
  TranscriptTask,
} from '../../src/application/lab/capture/capture-types.js';
import { renderDataBlock, type DataBlockSource } from '../../src/domain/egress/data-block.js';

// RF-1404: synthetic transcripts for the capture tests: invented code, invented cards, no run folder
// of the evaluation.

const TAGS = ['abcdefghijklmnopqrstuvwx', 'bcdefghijklmnopqrstuvwxy', 'cdefghijklmnopqrstuvwxyz'];

export function block(
  source: DataBlockSource,
  text: string,
  excerpts: { path: string; startLine: number; endLine: number }[] = [],
  which = 0,
): string {
  return renderDataBlock({ source, excerpts, text }, TAGS[which] ?? TAGS[0] ?? '');
}

export const message = (role: TranscriptMessage['role'], content: string): TranscriptMessage => ({
  role,
  content,
});

export const taskOf = (name: string, ...messages: TranscriptMessage[]): TranscriptTask => ({
  name,
  messages,
});

export const gapTask = taskOf(
  'planner-gap',
  message('system', 'You write task cards.'),
  message(
    'user',
    `${block('cards', JSON.stringify({ items: [{ id: 'feature:F-1', kind: 'feature', name: 'Search', detail: 'Finds a customer.' }] }), [], 0)}\n\n${block(
      'owner_answers',
      JSON.stringify({
        phases: [{ number: 1, name: 'Base', goal: 'The base exists.' }],
        requirements: [{ position: 1, title: 'Customer search' }],
        tasks: [{ id: 'T-001', title: 'Migrations' }],
      }),
      [],
      1,
    )}`,
  ),
  message('assistant', 'SECRET-MODEL-ANSWER {"tasks":[]}'),
);

export const mergeTask = taskOf(
  'summariser-br-2',
  message('system', 'You compare cards.'),
  message(
    'user',
    block(
      'cards',
      JSON.stringify([
        { id: 'BR-001', area: 'a', title: 'Late fee', summary: 's', claims: ['c1', 'c2'] },
        { id: 'BR-002', area: 'b', title: 'Late fees', summary: 's', claims: ['c3'] },
      ]),
    ),
  ),
  message('assistant', 'SECRET-MODEL-ANSWER {"merges":[]}'),
);

const areaText = [
  'area: shop',
  'files: 3',
  'shop/Orders.cs (csharp, 120 lines)',
  'shop/workbook.md (markdown, 9 lines)',
  'shop/logo.bin (unknown, skipped: binary)',
].join('\n');

export const readerTask = taskOf(
  'reader-004',
  message('system', 'You are a reader.'),
  message('user', `Describe the area.\n\n${block('list_area_files', areaText)}`),
  message('assistant', 'SECRET-MODEL-ANSWER'),
  message(
    'tool',
    block(
      'read_file',
      ['10: class Orders {', '11:   int Total() { return 1; }', '12: }'].join('\n'),
      [{ path: 'shop/Orders.cs', startLine: 10, endLine: 12 }],
    ),
  ),
);

/** A synthetic run folder on disk: a manifest and the transcripts, in the form the run wrote them. */
export async function writeRunFolder(
  folder: string,
  runId: string,
  tasks: readonly TranscriptTask[],
): Promise<void> {
  await mkdir(join(folder, 'transcripts'), { recursive: true });
  const manifest = { runId, roles: { reader: { maxTurns: 9 } } };
  await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest));
  for (const each of tasks) {
    const lines = each.messages.map((m, seq) => JSON.stringify({ schemaVersion: 1, seq, ...m }));
    await writeFile(join(folder, 'transcripts', `${each.name}.jsonl`), `${lines.join('\n')}\n`);
  }
}

export const capturedRun = (key: string, runId: string, tasks: TranscriptTask[]): CapturedRun => ({
  key,
  runId,
  tasks,
  maxTurns: 9,
});
