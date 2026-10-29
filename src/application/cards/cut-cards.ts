import { balancedEnd } from './extract-json.js';
import { parseCardsLenient, type CardParse, type ParseOptions } from './parse-cards.js';
import type { RowIndex } from './row-citations.js';

// RF-208, Q-55: an answer cut off at the model's output limit and not continued still holds cards
// that were finished before the cut. This reads the card list up to its last complete card and
// reads those cards like any answer; the card the cut ended inside is dropped and recorded as
// invalid output, never guessed at.

const cardsStart = /"cards"\s*:\s*\[|^\s*\[/u;

/** The complete objects of the list that starts at `from`, up to the first one that is cut off. */
function completeItems(raw: string, from: number): readonly string[] {
  const items: string[] = [];
  let at = from;
  for (;;) {
    while (at < raw.length && /[\s,]/u.test(raw[at] ?? '')) at += 1;
    if (raw[at] !== '{') return items;
    const end = balancedEnd(raw, at);
    if (end < 0) return items;
    items.push(raw.slice(at, end + 1));
    at = end + 1;
  }
}

function cutProblem(kept: number): CardParse['problems'][number] {
  return {
    path: `cards.${String(kept)}`,
    message:
      'The answer was cut off at the output limit inside this card, so it was not kept. The cards before it were kept.',
  };
}

/**
 * The cards finished before the cut, with the cut card listed as a problem; undefined if none.
 * They are read with the options of the whole answer (RF-645: suggested answers when required).
 */
export function readCutCards(
  raw: string,
  rows: RowIndex = new Map(),
  options: ParseOptions = {},
): CardParse | undefined {
  const start = cardsStart.exec(raw);
  if (start === null) return undefined;
  const items = completeItems(raw, start.index + start[0].length);
  const read = parseCardsLenient(`{"cards":[${items.join(',')}]}`, rows, options);
  if (read.drafts.length === 0) return undefined;
  return {
    drafts: read.drafts,
    problems: [...read.problems, cutProblem(items.length)],
    cutOff: false,
  };
}
