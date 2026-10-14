import { appendFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import type { Clock } from '../../../src/application/ports/clock.js';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { e2ePort } from './server-config.js';

// RF-1011, P1-37: the files of a run of the end-to-end server, for the journeys that need a call or a
// log entry the recorded run does not make (a 429 that was retried, a timeout, a security event).
// The server is the real one and reads these files through its own routes; nothing of its API is
// replaced. The data folder is the one serve.ts makes for this port.

const dataDir = (): string => join(tmpdir(), `rosetta-e2e-${String(e2ePort())}`);

const runRow = z.object({ projectId: z.string(), runId: z.string() });

export interface RunFolder {
  readonly userId: string;
  readonly runKey: string;
  readonly dir: string;
}

/** The folder of a run, found from its UUID through the run route and the users' workspaces. */
export async function runFolderOf(page: Page, runUuid: string): Promise<RunFolder> {
  await page.goto('/projects');
  const body: unknown = await page.evaluate(
    async (path) => (await fetch(path)).json(),
    `/api/runs/${runUuid}`,
  );
  const { projectId, runId } = runRow.parse(body);
  for (const userId of await readdir(join(dataDir(), 'users'))) {
    const dir = join(dataDir(), 'users', userId, 'projects', projectId, 'runs', runId);
    const found = await readdir(dir).then(
      () => true,
      () => false,
    );
    if (found) return { userId, runKey: runId, dir };
  }
  throw new Error(`The folder of run ${runUuid} was not found.`);
}

const callLine = z.looseObject({ seq: z.number() });

/** Appends attempts to the run's provider call log, numbering them after the lines it holds. */
async function appendCalls(
  folder: RunFolder,
  make: (first: Record<string, unknown>) => readonly Record<string, unknown>[],
): Promise<void> {
  const file = join(folder.dir, 'provider-calls.jsonl');
  const lines = (await readFile(file, 'utf8')).split('\n').filter((line) => line !== '');
  const first = z.record(z.string(), z.unknown()).parse(JSON.parse(lines[0] ?? '{}'));
  const last = callLine.parse(JSON.parse(lines.at(-1) ?? '{}')).seq;
  const added = make(first).map((record, index) =>
    JSON.stringify({ ...record, schemaVersion: 1, seq: last + index + 1 }),
  );
  await appendFile(file, `${added.join('\n')}\n`, 'utf8');
}

/**
 * Appends entries of this run to today's application log file. The time comes from the harness
 * clock; the default is the system clock, because the server reads today's file by its own clock.
 */
export async function appendLogs(
  folder: RunFolder,
  entries: readonly { level: string; logger: string; message: string; code?: string }[],
  clock: Clock = new SystemClock(),
): Promise<void> {
  // One millisecond apart, so the entries keep their order.
  const ticks = new FixedClock(clock.now().toISOString());
  const file = join(dataDir(), 'logs', `rosetta-${ticks.now().toISOString().slice(0, 10)}.jsonl`);
  const lines = entries.map((entry) => {
    const at = ticks.now().toISOString();
    ticks.advance(1);
    return JSON.stringify({
      schemaVersion: 1,
      at,
      runId: folder.runKey,
      userId: folder.userId,
      ...entry,
    });
  });
  await appendFile(file, `${lines.join('\n')}\n`, 'utf8');
}

/**
 * A 429 that was retried and answered on the second attempt, and a call that timed out, both of an
 * OpenAI verifier: the problems the recorded run does not have.
 */
export async function appendProblemCalls(folder: RunFolder): Promise<void> {
  const cloud = {
    ...{ provider: 'cloud', kind: 'openai', role: 'verifier' },
    ...{ ollama: undefined, transcriptRef: undefined },
  };
  const none = { inputTokens: 0, outputTokens: 0, timeToFirstTokenMs: 0, finishReason: 'error' };
  await appendCalls(folder, (first) => [
    {
      ...{ ...first, ...cloud, ...none, callId: `${folder.runKey}#90`, attempt: 1 },
      ...{ status: 'retried', httpStatus: 429, errorCode: 'RST-1504', latencyMs: 300 },
    },
    {
      ...{ ...first, ...cloud, callId: `${folder.runKey}#90`, attempt: 2, status: 'ok' },
      ...{ latencyMs: 2000, timeToFirstTokenMs: 900 },
    },
    {
      ...{ ...first, ...cloud, ...none, callId: `${folder.runKey}#91`, attempt: 1 },
      ...{ status: 'failed', errorCode: 'RST-1505', latencyMs: 30_000 },
    },
  ]);
}

async function filesUnder(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    found.push(...(entry.isDirectory() ? await filesUnder(path) : [path]));
  }
  return found;
}

/**
 * The files of the server's data folder (run folders, reports, application logs) that hold `text`,
 * and how many files it looked at, so a check that finds nothing can show it looked.
 */
export async function filesHolding(text: string): Promise<{ held: string[]; looked: number }> {
  const files = await filesUnder(dataDir());
  const held: string[] = [];
  for (const file of files) {
    if ((await readFile(file, 'utf8')).includes(text)) held.push(file);
  }
  return { held, looked: files.length };
}

/** Stub until the check reads the listed files one by one (P1-155). */
export function filesHoldingIn(
  root: string,
  text: string,
  read?: (file: string) => Promise<string>,
): Promise<{ held: string[]; looked: number }> {
  return Promise.reject(
    new Error(`not implemented: ${root} ${text} ${String(read !== undefined)}`),
  );
}
