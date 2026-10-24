import type { MaskResult, TextMasker } from './secret-masker.js';

// RNF-003, RF-1011: masking is a pure function of the text, and `maskDeep` asks it about the same
// short key names and values on every line of a log, so a reader of a large log remembers the
// answers for short texts. The answer is the masker's own, never a guess: a text that is not
// remembered is masked as before. The memory is bounded; when it is full it starts again.

/** Texts longer than this are masked every time: they rarely repeat and would fill the memory. */
const LONGEST_REMEMBERED = 160;
const MOST_REMEMBERED = 20_000;

export class MemoizedMasker implements TextMasker {
  readonly #masker: TextMasker;
  readonly #answers = new Map<string, MaskResult>();

  constructor(masker: TextMasker) {
    this.#masker = masker;
  }

  mask(text: string): MaskResult {
    if (text.length > LONGEST_REMEMBERED) return this.#masker.mask(text);
    const known = this.#answers.get(text);
    if (known !== undefined) return known;
    const answer = this.#masker.mask(text);
    if (this.#answers.size >= MOST_REMEMBERED) this.#answers.clear();
    this.#answers.set(text, answer);
    return answer;
  }
}
