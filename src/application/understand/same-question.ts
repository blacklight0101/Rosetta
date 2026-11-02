// RF-646, RF-243, Q-52, EV-57, P8-05: the one rule for "these two questions ask the same thing".
// Every place that compares questions (the open questions of a run, the merge into an answered
// question, the re-run, the project's answers file) uses `sameQuestion`. The thresholds and the
// word lists below are the whole rule; change them here only.

/** At least this many subject words must be shared. */
const MIN_SHARED_WORDS = 3;
/** The shared subject words must be at least this share of the subject words of both questions together. */
const MIN_OVERLAP = 0.6;

/** Words that open a question; two questions must open with the same one, wherever it stands. */
const askWords = new Set(['what', 'where', 'who', 'whom', 'whose', 'when', 'why', 'how', 'which']);

/** Words that carry no subject. */
const stopWords = new Set(
  `a an the is are was were be been being do does did can could should would will shall may might
   must of in on at to for from by with within into as and or if it its this that these those there
   their they them than then so such not no any all`.split(/\s+/u),
);

/** "Who uses these pages?" and "who uses these pages" are the same question; '' when no words. */
function questionWords(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** A plural folds into its singular: "refunds" and "refund" are the same subject word. */
function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

function contentOf(words: string): ReadonlySet<string> {
  return new Set(
    words
      .split(' ')
      .filter((word) => !stopWords.has(word) && !askWords.has(word))
      .map(stem),
  );
}

/** The first question word of the question; '' when it has none ("Is X stored?"). */
function askOf(words: string): string {
  return words.split(' ').find((word) => askWords.has(word)) ?? '';
}

/**
 * Whether two questions ask the same thing. Equal normalised words always match; otherwise both
 * use the same question word and their subject words (stop words and question words removed,
 * plurals folded) overlap highly: the subject words of one are all in the other, at least
 * `MIN_SHARED_WORDS`, and `MIN_OVERLAP` of both together. A word that only one question has
 * may be the decisive one, so a question that swaps a word for another never matches; one that
 * only adds words does, and the report lists every such merge so a wrong one can be seen.
 */
export function sameQuestion(a: string, b: string): boolean {
  const first = questionWords(a);
  const second = questionWords(b);
  if (first === '' || second === '') return false;
  if (first === second) return true;
  if (askOf(first) !== askOf(second)) return false;
  const left = contentOf(first);
  const right = contentOf(second);
  const shared = [...left].filter((word) => right.has(word)).length;
  const union = left.size + right.size - shared;
  const subset = shared === Math.min(left.size, right.size);
  return subset && shared >= MIN_SHARED_WORDS && shared >= MIN_OVERLAP * union;
}

/**
 * How many subject words two questions share when the words of one are all in the other (the
 * question words may differ); 0 when each has a word the other lacks, which may be the decisive one.
 */
export function sharedSubjectWords(a: string, b: string): number {
  const left = contentOf(questionWords(a));
  const right = contentOf(questionWords(b));
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared === Math.min(left.size, right.size) ? shared : 0;
}

/** "What" and "which" ask for the thing of any question; the other words ask for one kind of thing. */
const generalAsk = new Set(['', 'what', 'which']);

/**
 * P8-08, EV-89: whether two questions of one run ask about the same subject in other words. Like
 * `sameQuestion`, but the question words differ and both are "what" or "which"
 * ("Which Azure services does the shop use?", "What Azure services does the shop depend on?"). A
 * who, when, why or how question never merges with another kind. The report lists every merge.
 */
export function sameSubject(a: string, b: string): boolean {
  const first = questionWords(a);
  const second = questionWords(b);
  if (first === '' || second === '') return false;
  const asks = [askOf(first), askOf(second)];
  // The same question word is the business of `sameQuestion`, which also guards a swapped word.
  if (asks[0] === asks[1] || !asks.every((each) => generalAsk.has(each))) return false;
  const left = contentOf(first);
  const right = contentOf(second);
  const shared = [...left].filter((word) => right.has(word)).length;
  const union = left.size + right.size - shared;
  return shared >= MIN_SHARED_WORDS && shared >= MIN_OVERLAP * union;
}
