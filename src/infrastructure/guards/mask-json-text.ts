import { maskDeep } from './mask-deep.js';
import type { TextMasker } from './secret-masker.js';

// RF-141, RNF-003, P2-42: the text of a `cards` block (the cards the summariser reads) is JSON. It
// is masked as a value, not as text: in the text a quote inside a string is escaped (`\"`), which a
// rule for a quoted secret does not read. Whatever its layout (compact, any indent, CRLF), valid
// JSON is written back with an indent of 2 (a cards block has no cited lines to keep in place).
// Known limit: text that is not JSON as a whole (text before the JSON) is returned as it is, for
// the text rules.

/** The JSON text with every secret in its strings masked, or the text itself when it is not JSON. */
// RF-141
export function maskJsonText(text: string, masker: TextMasker): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return text;
  }
  return JSON.stringify(maskDeep(value, masker), null, 2);
}
