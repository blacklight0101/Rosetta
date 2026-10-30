import { hasPhrase, isVersion, wordsOf } from './restated-words.js';

// RF-608, RF-609, RF-610, DEC-187: a backstop for what the planner prompt (package.v11) already asks
// it not to write. A decision whose title only names a subject of the brief ("Architecture Style
// Adoption", "Migration Order Focus", "Technology Stack Selection") restates the brief when its
// decision text only repeats what the brief records: the names of the choice, or the content words
// of the owner's typed answer. A text that adds anything else (an order of modules, a test tool, a
// pattern inside the style) is a decision of its own and stays.

type Words = readonly string[];

type Subject = 'style' | 'migration' | 'stack';

const stop = new Set([
  ...['the', 'a', 'an', 'of', 'for', 'and', 'to', 'in', 'on', 'with', 'by', 'be', 'will', 'is'],
  ...['are', 'it', 'its', 'as', 'at', 'or', 'that', 'this', 'from', 'then', 'our', 'new', 'all'],
]);

/** Words that add no decision to a text: the verbs of choosing and the names of the subjects. */
const filler = new Set([
  ...['system', 'overall', 'main', 'adopt', 'adoption', 'use', 'choose', 'choice', 'select'],
  ...['selection', 'selected', 'pick', 'decision', 'approach', 'focus', 'plan', 'standard'],
  ...['standardization', 'standardisation', 'architecture', 'architectural', 'style'],
  ...['migration', 'migrate', 'migrated', 'strategy', 'technology', 'technologies', 'stack'],
  ...['module', 'component', 'part', 'parts', 'followed'],
  ...['build', 'implement', 'follow', 'go', 'apply', 'create'],
]);

const subjectWords: Readonly<Record<Subject, readonly string[]>> = {
  style: ['architecture', 'architectural', 'style', 'pattern'],
  migration: ['migration', 'strategy', 'order', 'ordering', 'sequence', 'cutover'],
  stack: ['technology', 'technologies', 'stack', 'tech'],
};

/** The words of the layers, as a text may write them. */
const layerWords = new Set([
  ...['language', 'runtime', 'back', 'end', 'backend', 'framework', 'front', 'frontend'],
  ...['database', 'data', 'access', 'testing', 'hosting'],
]);

/** The subject a title is only about: every word is a subject word or filler, and one is a subject word. */
function subjectOf(title: Words): Subject | undefined {
  const subjects = Object.keys(subjectWords) as Subject[];
  const allowed = new Set([...filler, ...stop, ...subjects.flatMap((s) => subjectWords[s])]);
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

/** The words of a text that carry a meaning: no small word and no version. */
function contentOf(words: Words): string[] {
  return words.filter((word) => !stop.has(word) && !isVersion(word));
}

function namedStack(stack: readonly Words[], body: Words): number[] {
  const plain = body.filter((word) => !isVersion(word));
  return stack.flatMap((entry, at) => {
    const words = entry.filter((word) => !isVersion(word));
    const unnamed = words.length === 0 || (words.length === 1 && (words[0]?.length ?? 0) < 3);
    return !unnamed && hasPhrase(plain, words) ? [at] : [];
  });
}

/** Whether the text says only what the brief records: every content word is a name of it, filler or a layer. */
function addsNothing(text: Words, known: readonly Words[], layers: boolean): boolean {
  const covered = new Set(known.flat());
  const content = contentOf(text);
  const rest = content.filter(
    (word) => !covered.has(word) && !filler.has(word) && !(layers && layerWords.has(word)),
  );
  return content.length > 0 && rest.length === 0;
}

/**
 * Whether a text says the typed answer by its content words: at least two and half of them, and at
 * least a third of the content words of the text itself, and the text adds nothing else beyond the
 * brief's names, filler and a few connectives, so a decision that adds an order or a login stays.
 */
function saysTyped(text: Words, typed: Words, share: number, known: readonly Words[]): boolean {
  const wanted = new Set(contentOf(typed));
  const content = contentOf(text);
  const matched = new Set(content.filter((word) => wanted.has(word)));
  if (wanted.size < 2 || matched.size < Math.max(2, Math.ceil(wanted.size / 2))) return false;
  const enough = matched.size >= share * new Set(content).size;
  return enough && addsNothing(text, [typed, ...known], false);
}

const choosingVerbs = ['adopt', 'use', 'choose', 'select', 'pick', 'build', 'implement'];
const moreVerbs = ['follow', 'go', 'apply', 'create'];

/** RF-608: a title that begins with a choosing verb and says the typed answer, or says all of it. */
export function sayingTyped(title: string, typed: Words, known: readonly Words[] = []): boolean {
  const words = wordsOf(title);
  if (typed.length >= 2 && hasPhrase(words, typed)) return true;
  return (
    [...choosingVerbs, ...moreVerbs].includes(words[0] ?? '') && saysTyped(words, typed, 0.5, known)
  );
}

type Found = { readonly subject: Subject; readonly layer: number } | undefined;

function stackFound(names: BriefNames, body: Words): Found {
  const found = namedStack(names.stack, body);
  const first = found[0];
  const known = names.stack.map((entry) => entry.filter((word) => !isVersion(word)));
  const enough = found.length >= Math.min(2, names.stack.length);
  if (first === undefined || !enough || !addsNothing(body, known, true)) return undefined;
  return { subject: 'stack', layer: first };
}

function choiceFound(subject: 'style' | 'migration', names: BriefNames, body: Words): Found {
  const typed = subject === 'style' ? names.typedStyle : names.typedMigration;
  const only = addsNothing(body, names[subject], false);
  const namesIt = names[subject].some((phrase) => hasPhrase(body, phrase));
  return (only && namesIt) || saysTyped(body, typed, 0.3, names[subject])
    ? { subject, layer: -1 }
    : undefined;
}

/** RF-608: where a subject title restates a choice, by the text of the decision; the layer index for the stack. */
export function restatedBySubject(title: string, text: string, names: BriefNames): Found {
  const subject = subjectOf(wordsOf(title));
  if (subject === undefined) return undefined;
  const body = wordsOf(text);
  return subject === 'stack' ? stackFound(names, body) : choiceFound(subject, names, body);
}
