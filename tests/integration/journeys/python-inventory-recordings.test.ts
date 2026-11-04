import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { searchJson } from '../../../src/application/cards/extract-json.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { fixtureRoot } from '../../support/scan-harness.js';

// ADR-005, ADR-008, RF-609, P8-120: the recordings that answer the understand run and the plan of the
// Python inventory project (`tests/fixtures/repos/python-inventory/`) cite its real files and lines,
// and the plan cites only cards the reader recording writes. A citation that names a file or a line the
// fixture does not have would be a rejected claim in the end-to-end run, not a card.

const folder = join('tests', 'recordings', 'fake');
const READER = 'understand-python-inventory.json';
const PLANNER = 'planner-python-inventory.json';

const citation = /^(?<path>[^:\s]+):(?<start>\d+)-(?<end>\d+)$/u;
const card = z.object({
  type: z.string(),
  claims: z.array(z.object({ text: z.string(), citations: z.array(z.string()) })),
});
const readerAnswer = z.object({ cards: z.array(card) });
const readFileArguments = z.object({
  path: z.string(),
  startLine: z.number(),
  endLine: z.number(),
});

type Card = z.infer<typeof card>;
type Read = z.infer<typeof readFileArguments>;

/** The line count of a file of the fixture, or undefined when the fixture has no such file. */
async function linesOf(path: string): Promise<number | undefined> {
  try {
    const text = await readFile(join(fixtureRoot('python-inventory'), path), 'utf8');
    return text.trimEnd().split('\n').length;
  } catch {
    return undefined;
  }
}

/** What the reader recording asks to read, and the cards it answers, in the order of its calls. */
async function readerOf(): Promise<{ reads: Read[]; cards: Card[] }> {
  const recording = await loadRecording(join(folder, READER));
  const reads: Read[] = [];
  const cards: Card[] = [];
  for (const call of recording.calls) {
    const attempt = call.attempts.at(-1);
    if (attempt === undefined || !('response' in attempt)) continue;
    for (const toolCall of attempt.response.toolCalls) {
      reads.push(readFileArguments.parse(toolCall.arguments));
    }
    for (const value of searchJson(attempt.response.text).values) {
      const parsed = readerAnswer.safeParse(value);
      if (parsed.success) cards.push(...parsed.data.cards);
    }
  }
  return { reads, cards };
}

/** The ids the reader recording gives its cards: the type and the order of the cards of that type (P8-94). */
function idsOf(cards: readonly Card[]): Set<string> {
  const seen = new Map<string, number>();
  const ids = new Set<string>();
  for (const { type, claims } of cards) {
    const number = (seen.get(type) ?? 0) + 1;
    seen.set(type, number);
    const id = `${type}-${String(number).padStart(3, '0')}`;
    ids.add(id);
    claims.forEach((_, index) => ids.add(`${id}.c${String(index + 1)}`));
  }
  return ids;
}

/** True when `lines` is the length of a real file and 1 <= start <= end <= lines. */
function inside(lines: number | undefined, start: number, end: number): boolean {
  return lines !== undefined && start >= 1 && end >= start && end <= lines;
}

/** The citations of the cards that name a file or lines the fixture does not have. */
async function badCitations(cards: readonly Card[]): Promise<string[]> {
  const bad: string[] = [];
  for (const text of cards.flatMap((each) => each.claims.flatMap((claim) => claim.citations))) {
    const found = citation.exec(text)?.groups;
    const lines = await linesOf(found?.['path'] ?? '');
    if (!inside(lines, Number(found?.['start']), Number(found?.['end']))) bad.push(text);
  }
  return bad;
}

/** The reads that name a file or lines the fixture does not have. */
async function badReads(reads: readonly Read[]): Promise<string[]> {
  const bad: string[] = [];
  for (const read of reads) {
    if (!inside(await linesOf(read.path), read.startLine, read.endLine)) {
      bad.push(`${read.path}:${String(read.startLine)}-${String(read.endLine)}`);
    }
  }
  return bad;
}

describe('the Python inventory recordings cite the fixture', () => {
  it('RF-609 ADR-005 the reader recording reads and cites only lines the fixture has', async () => {
    const { reads, cards } = await readerOf();

    expect(cards.length).toBeGreaterThanOrEqual(4);
    const cited = cards.flatMap((each) => each.claims.flatMap((claim) => claim.citations));
    const files = new Set(cited.map((each) => citation.exec(each)?.groups?.['path']));
    expect([...files].toSorted()).toEqual(
      expect.arrayContaining(['inventory/stock.py', 'main.py', 'sql/schema.sql']),
    );
    expect(await badCitations(cards)).toEqual([]);
    expect(await badReads(reads)).toEqual([]);
  });

  it('RF-609 ADR-005 the planner recording cites only cards the reader recording writes', async () => {
    const { cards } = await readerOf();
    const known = idsOf(cards);
    const recording = await loadRecording(join(folder, PLANNER));
    const attempt = recording.calls[0]?.attempts.at(-1);
    const text = attempt !== undefined && 'response' in attempt ? attempt.response.text : '';
    const cited = new Set(text.match(/\b(?:FEAT|BR|ENT|INT|OQ|FLOW|SCRN)-\d{3}(?:\.c\d+)?\b/gu));

    expect(cited.size).toBeGreaterThanOrEqual(3);
    expect([...cited].filter((id) => !known.has(id))).toEqual([]);
  });
});
