// RF-608: word helpers of the "decided once" check, shared by the title rules and the subject rule.

/** The words of a text, lower case, in order. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '');
}

export function isVersion(word: string): boolean {
  return /^v?\d+$/u.test(word);
}

export function hasPhrase(words: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0) return false;
  return words.some((_, at) => phrase.every((word, offset) => words[at + offset] === word));
}
