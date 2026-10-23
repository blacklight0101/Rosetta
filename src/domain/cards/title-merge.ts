import type { CardMerge } from './card-merge.js';
import type { Card } from './card.js';

// P3-106, P3-110, RF-230, RF-250, EV-05, EV-25: two cards of one area and one type whose titles are the
// same once case, punctuation and plurals are ignored describe one thing twice (two reader tasks
// wrote it), so they are one card without asking a model. The area is part of the key: the same title
// in two areas (the same entity in two applications of one repository) is two subjects, each with its
// own files, and one card would hold claims of both under one area. The first card's title and
// summary stay; the merge keeps every distinct claim (`applyMerges`). `FLOW` cards are left out: two journeys with one title are two
// journeys, each with its own trigger, steps and branches (RF-260).

function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/** The title with case, punctuation, spacing and a plural `s` taken out, to compare titles. */
export function normalisedTitle(title: string): string {
  const words = title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return words.map(singular).join(' ');
}

/** The merges of the cards that share an area, a type and a normalised title, in card order. */
// RF-230
export function titleMerges(cards: readonly Card[]): readonly CardMerge[] {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    if (card.type === 'FLOW') continue;
    const key = [card.area, card.type, normalisedTitle(card.title)].join('\u0000');
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [card]);
    else group.push(card);
  }
  return [...groups.values()].flatMap((group) => {
    const [first] = group;
    if (first === undefined || group.length < 2) return [];
    return [{ ids: group.map((card) => card.id), title: first.title, summary: first.summary }];
  });
}
