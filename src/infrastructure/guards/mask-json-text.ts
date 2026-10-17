import { maskDeep } from './mask-deep.js';
import type { TextMasker } from './secret-masker.js';

// RF-141, RNF-003, P2-42: text that is JSON written by `JSON.stringify(value, null, 2)` (the cards
// the summariser reads) is masked as a value, not as text: in the text a quote inside a string is
// escaped (`\"`), which a rule for a quoted secret does not read. Any other text, also JSON written
// another way, is returned as it is for the text rules, so a file's lines never move.

/** The text with every secret in its strings masked, or the text itself when it is not that JSON. */
// RF-141
export function maskJsonText(text: string, masker: TextMasker): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return text;
  }
  if (JSON.stringify(value, null, 2) !== text) return text;
  return JSON.stringify(maskDeep(value, masker), null, 2);
}
