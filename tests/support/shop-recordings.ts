import { join } from 'node:path';
import type { z } from 'zod';
import { searchJson } from '../../src/application/cards/extract-json.js';
import { loadRecording } from '../../src/infrastructure/providers/fake/recording.js';

// RF-210, ADR-008, P8-115: the answers of the shop recordings of the documentation-set journey, read
// as the replay reads them, and the cards the journey wrote, so a test can say which card a recorded
// answer names. A recording cites cards by id; the ids follow the order the readers run in (P8-94).

const folder = join('tests', 'recordings', 'fake');

/** The text of the answer of one recorded call: its last attempt, which is the answer. */
async function answerText(file: string, call: number): Promise<string> {
  const recording = await loadRecording(join(folder, file));
  const attempt = recording.calls[call]?.attempts.at(-1);
  if (attempt === undefined || !('response' in attempt)) {
    throw new Error(`${file} call ${String(call)} holds no answer`);
  }
  return attempt.response.text;
}

/** The JSON object one recorded call answers, checked against the schema of the part a test reads. */
export async function recordedAnswer<S extends z.ZodType>(
  file: string,
  call: number,
  schema: S,
): Promise<z.output<S>> {
  const text = await answerText(file, call);
  for (const value of searchJson(text).values) {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  throw new Error(`${file} call ${String(call)} is not the answer expected`);
}

const cardOrClaim = /\b(?:FEAT|FLOW|SCRN|ENT|BR|OQ)-\d{3}(?:\.c\d+)?\b/gu;

/** Every card id and claim id the answers of the recordings cite (the number of calls of each file), once each. */
export async function citedIds(calls: Readonly<Record<string, number>>): Promise<string[]> {
  const found = new Set<string>();
  for (const [file, count] of Object.entries(calls)) {
    for (let call = 0; call < count; call += 1) {
      for (const id of (await answerText(file, call)).match(cardOrClaim) ?? []) found.add(id);
    }
  }
  return [...found].toSorted();
}

/** The title of each card the understand run wrote, by id (`# <id> <title>` of `cards/<TYPE>/<id>.md`). */
export function cardTitles(specification: Readonly<Record<string, string>>): Map<string, string> {
  const titles = new Map<string, string>();
  for (const [path, text] of Object.entries(specification)) {
    const heading = /^# (\S+) (.+)$/mu.exec(text);
    if (path.startsWith('cards/') && heading?.[1] !== undefined && heading[2] !== undefined) {
      titles.set(heading[1], heading[2]);
    }
  }
  return titles;
}
