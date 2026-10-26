import type { SecretLines } from '../../application/ports/secret-lines.js';
import type { TextMasker } from './secret-masker.js';

// P5-34, RF-141, ADR-013: the lines a masker changes. The masker keeps every line where it was, so
// the line that differs in the masked text is the line that held the secret; a secret that spans
// lines (a private key) marks each line it covers. One pass of the masker's own linear rules.

const lineBreak = /\r\n|\r|\n/u;

export class MaskedLineFinder implements SecretLines {
  private readonly masker: TextMasker;

  constructor(masker: TextMasker) {
    this.masker = masker;
  }

  // RF-141
  of(text: string): readonly number[] {
    const masked = this.masker.mask(text).text;
    if (masked === text) return [];
    const before = text.split(lineBreak);
    const after = masked.split(lineBreak);
    const found: number[] = [];
    before.forEach((line, index) => {
      if (after[index] !== line) found.push(index + 1);
    });
    return found;
  }
}
