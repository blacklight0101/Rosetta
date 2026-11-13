import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  CapturedRun,
  TranscriptMessage,
} from '../../application/lab/capture/capture-types.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-1404: reads a saved run folder for the capture, read-only: `manifest.json` (the run id and the
// reader's turn limit) and `transcripts/<agent task>.jsonl`. The folder may be the run folder or
// the folder that holds exactly one. Nothing in it is written, and no other file is opened.

const DEFAULT_TURNS = 12;

const manifest = z.object({
  runId: z.string().min(1).max(100),
  roles: z
    .object({ reader: z.object({ maxTurns: z.number().int().positive().nullable() }) })
    .partial()
    .optional(),
});

const line = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
});

async function runFolderOf(path: string): Promise<string | undefined> {
  const entries = await readdir(path, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === 'manifest.json')) return path;
  const inner: string[] = [];
  for (const entry of entries.filter((each) => each.isDirectory())) {
    const sub = await readdir(join(path, entry.name)).catch((): string[] => []);
    if (sub.includes('manifest.json')) inner.push(join(path, entry.name));
  }
  return inner.length === 1 ? inner[0] : undefined;
}

async function messagesOf(file: string): Promise<TranscriptMessage[]> {
  const text = await readFile(file, 'utf8');
  return text
    .split('\n')
    .filter((each) => each.trim() !== '')
    .flatMap((each) => {
      try {
        const read = line.safeParse(JSON.parse(each));
        return read.success ? [read.data] : [];
      } catch {
        return [];
      }
    });
}

// RF-1404
export async function readRunFolder(
  path: string,
  key: string,
): Promise<Result<CapturedRun, string>> {
  try {
    const folder = await runFolderOf(path);
    if (folder === undefined) return err(`${path} is not a run folder (no single manifest.json).`);
    const head = manifest.safeParse(
      JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')),
    );
    if (!head.success) return err(`${folder}/manifest.json has no run id.`);
    const names = (await readdir(join(folder, 'transcripts'))).filter((n) => n.endsWith('.jsonl'));
    const tasks = await Promise.all(
      names.sort().map(async (name) => ({
        name: name.slice(0, -'.jsonl'.length),
        messages: await messagesOf(join(folder, 'transcripts', name)),
      })),
    );
    const maxTurns = head.data.roles?.reader?.maxTurns ?? DEFAULT_TURNS;
    return ok({ key, runId: head.data.runId, tasks, maxTurns });
  } catch {
    return err(`The run folder ${path} cannot be read.`);
  }
}

// RF-1404
export async function writeCaseSetFile(
  casesFolder: string,
  name: string,
  data: unknown,
): Promise<string> {
  await mkdir(casesFolder, { recursive: true });
  const file = join(casesFolder, `${name}.json`);
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return file;
}

/** The JSON of a file, unparsed by any schema: the caller checks it. */
// RF-1404
export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

// RF-1405
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
