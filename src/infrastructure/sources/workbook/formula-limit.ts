import { quoted, workbookFormulaTooLong } from './workbook-errors.js';

// RF-151, DEC-152: a formula is at most 8,192 characters, the most Excel can write. The length is
// that of the text the parser hands over: XML already unescaped, in UTF-16 code units (what
// `String.length` counts, and what Excel counts). Every reader that collects a formula checks it
// as the text streams in, so a longer one stops the part before the rest of it is held, and
// before it can reach the tokenizer or the renderer.

const MAX_FORMULA_LENGTH = 8192;

/** Throws RST-1931 when `length` is over the limit; `place` is only built for the refusal. */
export function checkFormulaLength(length: number, fileName: string, place: () => string): void {
  if (length > MAX_FORMULA_LENGTH) {
    throw workbookFormulaTooLong(fileName, place(), MAX_FORMULA_LENGTH);
  }
}

export function cellPlace(sheet: string, address: string): string {
  return `sheet ${quoted(sheet)}, cell ${address}`;
}

export function namePlace(name: string, sheet: string | undefined): string {
  const scope = sheet === undefined ? '' : `, sheet ${quoted(sheet)}`;
  return `defined name ${quoted(name)}${scope}`;
}

export function rulePlace(kind: string, sheet: string, ranges: string): string {
  return `sheet ${quoted(sheet)}, ${kind} rule on ${quoted(ranges)}`;
}
