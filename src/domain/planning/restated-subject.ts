import { hasPhrase, isVersion, wordsOf } from './restated-words.js';

// RF-608, RF-609, RF-610, DEC-187: a planner decision whose title only names a subject of the brief
// ("Architecture Style Adoption", "Migration Order Focus", "Technology Stack Selection") restates
// the brief when its text names the choice the brief records: the style, the strategy, the typed
// answer or the answered technologies. A subject title alone decides nothing, and a text that names
// a choice in passing under another subject is left alone.

type Words = readonly string[];

export type Subject = 'style' | 'migration' | 'stack';

const filler = [
  ...['the', 'a', 'an', 'of', 'for', 'and', 'to', 'our', 'new', 'system', 'overall', 'main'],
  ...['adopt', 'adoption', 'use', 'choose', 'choice', 'select', 'selection', 'pick', 'decision'],
  ...['approach', 'focus', 'plan', 'standard', 'standardization', 'standardisation'],
];

const subjectWords: Readonly<Record<Subject, readonly string[]>> = {
  style: ['architecture', 'architectural', 'style', 'pattern'],
  migration: ['migration', 'strategy', 'order', 'ordering', 'sequence', 'cutover', 'rollout'],
  stack: ['technology', 'technologies', 'stack', 'tech'],
};

/** The subject a title is only about: every word is a subject word or filler, and one is a subject word. */
function subjectOf(title: Words): Subject | undefined {
  const subjects = Object.keys(subjectWords) as Subject[];
  const allowed = new Set([...filler, ...subjects.flatMap((subject) => subjectWords[subject])]);
  if (title.length === 0 || !title.every((word) => allowed.has(word))) return undefined;
  return subjects.find((subject) => subjectWords[subject].some((word) => title.includes(word)));
}

export interface BriefNames {
  readonly style: readonly Words[];
  readonly migration: readonly Words[];
  /** The answered technologies, one entry each, in the brief's order. */
  readonly stack: readonly Words[];
  /** The typed architecture and migration answers, as words. */
  readonly typedStyle: Words;
  readonly typedMigration: Words;
}

function namedStack(stack: readonly Words[], body: Words): number[] {
  return stack.flatMap((entry, at) => {
    const words = entry.filter((word) => !isVersion(word));
    const unnamed = words.length === 0 || (words.length === 1 && (words[0]?.length ?? 0) < 3);
    return !unnamed && hasPhrase(body, words) ? [at] : [];
  });
}

/** RF-608: where a subject title restates a choice, by the text of the decision; the layer index for the stack. */
export function restatedBySubject(
  title: string,
  text: string,
  names: BriefNames,
): { readonly subject: Subject; readonly layer: number } | undefined {
  const subject = subjectOf(wordsOf(title));
  if (subject === undefined) return undefined;
  const body = wordsOf(text);
  const typed = subject === 'style' ? names.typedStyle : names.typedMigration;
  if (subject === 'stack') {
    const found = namedStack(names.stack, body);
    const needed = Math.min(2, names.stack.length);
    const first = found[0];
    return first !== undefined && found.length >= needed ? { subject, layer: first } : undefined;
  }
  const options = [...names[subject], ...(typed.length >= 2 ? [typed] : [])];
  return options.some((phrase) => hasPhrase(body, phrase)) ? { subject, layer: -1 } : undefined;
}

/** RF-608: a title that says the typed answer (two words or more) restates it, whatever else it says. */
export function sayingTyped(title: string, typed: Words): boolean {
  return typed.length >= 2 && hasPhrase(wordsOf(title), typed);
}
