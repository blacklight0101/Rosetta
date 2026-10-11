/** Small parsers for the documentation consistency tests (RNF-005). Pure string functions, no file access. */

export type AdrStatus = 'Accepted' | 'Proposed' | 'Amended' | 'Superseded';

export interface AdrTotals {
  readonly total: number;
  readonly Accepted: number;
  readonly Proposed: number;
  readonly Amended: number;
  readonly Superseded: number;
}

export interface AdrIndexRow {
  readonly id: string;
  readonly status: AdrStatus;
}

export interface Card {
  readonly id: string;
  readonly title: string;
  readonly difficulty: number;
  readonly size: string;
  readonly dependsOn: readonly string[];
  readonly status: string;
}

export interface CardCounts {
  readonly cards: number;
  readonly haiku: number;
  readonly sonnet: number;
  readonly opus: number;
  readonly fable: number;
  readonly s: number;
  readonly m: number;
  readonly l: number;
  readonly followUps: number;
  readonly withdrawn: number;
}

const STATUS_WORDS: readonly AdrStatus[] = ['Accepted', 'Proposed', 'Amended', 'Superseded'];

/** The first capture group of a match, or a failure that names what was not found. */
function group(match: RegExpMatchArray | null, what: string): string {
  const value = match?.[1];
  if (value === undefined) {
    throw new Error(`Not found in the document: ${what}`);
  }
  return value;
}

/** Reduces a status such as "Accepted (2026-10-11, DEC-113)" or "Superseded by ADR-012" to its index value. */
export function normalizeAdrStatus(raw: string): AdrStatus {
  const found = STATUS_WORDS.find((word) => new RegExp(`^${word}\\b`).test(raw.trim()));
  if (found === undefined) {
    throw new Error(`Unknown ADR status: ${raw}`);
  }
  return found;
}

export function parseAdrStatusLine(markdown: string): AdrStatus {
  return normalizeAdrStatus(group(markdown.match(/^\*\*Status\*\*:\s*(.+)$/m), 'ADR Status line'));
}

export function parseAdrTotals(markdown: string): AdrTotals {
  const line = group(markdown.match(/^\*\*Totals\*\*:\s*(.+)$/m), 'ADR index Totals line');
  const number = (label: string): number =>
    Number(group(line.match(new RegExp(`${label}\\s+(\\d+)`)), `Totals ${label}`));
  return {
    total: Number(group(line.match(/^(\d+) in total/), 'Totals total')),
    Accepted: number('Accepted'),
    Proposed: number('Proposed'),
    Amended: number('Amended'),
    Superseded: number('Superseded'),
  };
}

export function parseAdrIndexRows(markdown: string): AdrIndexRow[] {
  const rows: AdrIndexRow[] = [];
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const id = cells[1]?.match(/^\[(ADR-\d{3})\]/)?.[1];
    const status = cells[3];
    if (id !== undefined && status !== undefined) {
      rows.push({ id, status: normalizeAdrStatus(status) });
    }
  }
  return rows;
}

function parseField(block: string, name: string): string {
  return group(
    block.match(new RegExp(`^- \\*\\*${name}\\*\\*:\\s*(.+)$`, 'm')),
    `card field ${name}`,
  );
}

function parseDependsOn(value: string): string[] {
  return value.trim() === 'none' ? [] : value.split(',').map((id) => id.trim());
}

export function parseCards(markdown: string): Card[] {
  const blocks = markdown.split(/^(?=### P\d-\d+ - )/m).filter((b) => /^### P\d-\d+ - /.test(b));
  return blocks.map((block) => {
    const heading = block.match(/^### (P\d-\d+) - (.+)$/m);
    return {
      id: group(heading, 'card id'),
      title: heading?.[2] ?? '',
      difficulty: Number(group(parseField(block, 'Difficulty').match(/^(\d+)/), 'card difficulty')),
      size: parseField(block, 'Size'),
      dependsOn: parseDependsOn(parseField(block, 'Depends on')),
      status: parseField(block, 'Status'),
    };
  });
}

const COLUMN_COUNT = 10;

function toCounts(v: readonly number[]): CardCounts {
  const [cards = NaN, haiku = NaN, sonnet = NaN, opus = NaN, fable = NaN] = v;
  const [s = NaN, m = NaN, l = NaN, followUps = NaN, withdrawn = NaN] = v.slice(5);
  return { cards, haiku, sonnet, opus, fable, s, m, l, followUps, withdrawn };
}

/** Rows of the Totals table keyed by phase ("P1") or "Total". */
export function parseTaskTotals(markdown: string): Map<string, CardCounts> {
  const totals = new Map<string, CardCounts>();
  for (const line of markdown.split('\n')) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.replaceAll('*', '').trim());
    const key = cells[0]?.match(/^(P\d|Total)\b/)?.[1];
    if (key !== undefined && cells.length === COLUMN_COUNT + 1) {
      totals.set(key, toCounts(cells.slice(1).map(Number)));
    }
  }
  return totals;
}

/** Counts the cards of one phase ("P1") or of all phases ("Total"). */
export function countCards(cards: readonly Card[], phase: string): CardCounts {
  const own = cards.filter((c) => phase === 'Total' || c.id.startsWith(`${phase}-`));
  const band = (low: number, high: number): number =>
    own.filter((c) => c.difficulty >= low && c.difficulty <= high).length;
  const size = (s: string): number => own.filter((c) => c.size === s).length;
  return {
    cards: own.length,
    haiku: band(1, 3),
    sonnet: band(4, 6),
    opus: band(7, 9),
    fable: band(10, 10),
    s: size('S'),
    m: size('M'),
    l: size('L'),
    followUps: own.filter((c) => c.title.startsWith('Follow-up:')).length,
    withdrawn: own.filter((c) => c.status.startsWith('Withdrawn')).length,
  };
}
