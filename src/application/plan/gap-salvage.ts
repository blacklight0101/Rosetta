import { balancedEnd, searchJson } from '../cards/extract-json.js';

// P7-14, RF-627, ADR-013: a gap answer that is not JSON as a whole (a small model wrote
// `"requirements": [ none ]` in one card, in the evaluation of 2026-10-29) still holds task objects
// that are JSON. When no value of the answer reads as a list of cards, the elements of its `tasks`
// list are cut out one by one, each by its balanced braces, and parsed on its own through the same
// guarded parser as any answer (no `__proto__`, bounded). An element that does not parse is kept as
// unreadable, with the ids its `builds` list names when that list alone parses, so the run can log
// it and ask the repair. More elements than an answer may hold, or no `tasks` list, is no answer.

/** An element of the `tasks` list that is not JSON; `builds` holds the ids it named, if readable. */
export class UnreadableCard {
  readonly builds: readonly string[];

  constructor(builds: readonly string[]) {
    this.builds = builds;
  }
}

const TASKS = /"tasks"\s*:\s*\[/u;
const BUILDS = /"builds"\s*:\s*\[/u;
const ID = 300;
const MAX_BUILDS = 500;

function skipSpaceAndCommas(text: string, from: number): number {
  let at = from;
  while (at < text.length && /[\s,]/u.test(text[at] ?? '')) at += 1;
  return at;
}

/** The index of the last character of the element that starts at `start`, or -1 when it is cut off. */
function elementEnd(text: string, start: number): number {
  const first = text[start];
  if (first === '{' || first === '[') return balancedEnd(text, start);
  for (let at = start; at < text.length; at += 1) {
    if (text[at] === ',' || text[at] === ']') return at - 1;
  }
  return -1;
}

/** The ids the `builds` list of an unreadable element names, when that list parses on its own. */
function namedBuilds(piece: string): string[] {
  const found = BUILDS.exec(piece);
  if (found === null) return [];
  const open = found.index + found[0].length - 1;
  const end = balancedEnd(piece, open);
  if (end < 0) return [];
  const [list] = searchJson(piece.slice(open, end + 1)).values;
  if (!Array.isArray(list)) return [];
  const ids = list.flatMap((each: unknown) =>
    typeof each === 'string' && each.length <= ID ? [each] : [],
  );
  return ids.slice(0, MAX_BUILDS);
}

function readElement(piece: string): unknown {
  const [value] = searchJson(piece).values;
  return value === undefined ? new UnreadableCard(namedBuilds(piece)) : value;
}

/** The elements of the answer's `tasks` list read one by one, or undefined when there is no list. */
// P7-14, RF-627
export function salvageTasks(text: string, maxCards: number): unknown[] | undefined {
  const found = TASKS.exec(text);
  if (found === null) return undefined;
  const cards: unknown[] = [];
  let at = skipSpaceAndCommas(text, found.index + found[0].length);
  while (at < text.length && text[at] !== ']') {
    const end = elementEnd(text, at);
    if (end < at) break;
    cards.push(readElement(text.slice(at, end + 1).trim()));
    if (cards.length > maxCards) return undefined;
    at = skipSpaceAndCommas(text, end + 1);
  }
  return cards;
}
