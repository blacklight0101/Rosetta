// RF-153, Q-38: the edits that show the workbook part of an external reference as the file name only.
// The tokenizer finds each reference with its exact place in the text and hands the workbook part to a
// recorder; nothing here scans formula text on its own, so a sheet name, a table specifier or a string
// is never mistaken for a workbook. The recorder fails toward hiding the folder.

export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const DIGITS = /^[0-9]{1,6}$/u;
const SEPARATOR = /[\\/]/u;
/**
 * A character a path written without quotes can hold in front of a bracket: anything Windows allows
 * in a folder or share name (so also a space, `-`, `(`, `&`, `'`, `#`, `!` or a letter beyond
 * ASCII), plus the separators. A `"` ends a string literal and never belongs to a path.
 */
const PATH_CHAR = /[^"<>|?*]/u;
/** Where a path starts inside such a run: a URL scheme, a drive or a UNC share. */
const PATH_START = /[A-Za-z]{2,10}:\/\/|[A-Za-z]:[\\/]|\\\\/u;
const STARTS_WITH_PATH = new RegExp(`^(?:${PATH_START.source})`, 'u');
const PREFIX_PATH = /[\\/]|^[A-Za-z]{1,10}:/u;

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}

export class EditRecorder {
  readonly edits: TextEdit[] = [];
  private readonly links: readonly string[];
  private readonly text: string;
  private lastEnd = 0;
  /** No path starts between here and the last place looked back from: that run is never read twice. */
  private noPathBelow = 0;
  private longDone = false;

  constructor(text: string, links: readonly string[]) {
    this.text = text;
    this.links = links;
  }

  /** The file name a bracket holds: a link number through the links, or a path cut to its last part. */
  private bookName(content: string): string {
    if (DIGITS.test(content)) {
      const link = this.links[Number(content) - 1];
      return link === undefined ? content : fileNameOf(link);
    }
    return SEPARATOR.test(content) ? fileNameOf(content) : content;
  }

  /** Records an edit; a part already in its final text is only marked as done, so nothing is read twice. */
  private add(start: number, end: number, text: string): void {
    if (start < this.lastEnd) return;
    this.lastEnd = end;
    if (this.text.slice(start, end) !== text) this.edits.push({ start, end, text });
  }

  /**
   * The length of a path written without quotes right before `at` (a `[` or a `'`), or 0. The
   * look-back stops at the previous edit or at the last run found free of a path start, so over a
   * whole formula every character is read at most once (a path start never straddles a `[` or `'`);
   * the earliest path start in the run wins, so the edit fails toward hiding more.
   */
  private pathBefore(at: number): number {
    const floor = Math.max(this.lastEnd, this.noPathBelow);
    let from = at;
    while (from > floor && PATH_CHAR.test(this.text.charAt(from - 1))) from -= 1;
    const found = PATH_START.exec(this.text.slice(from, at));
    if (found === null) this.noPathBelow = at;
    return found === null ? 0 : at - from - found.index;
  }

  /** `[book]` outside quotes, `text.slice(start, end)`, before a sheet name and `!`. */
  bracket(start: number, end: number): void {
    const name = this.bookName(this.text.slice(start + 1, end - 1));
    this.add(start - this.pathBefore(start), end, `[${name}]`);
  }

  /**
   * A bracket group that is not followed by `Sheet!`, so a table specifier to the tokenizer. A stray
   * quote in a hand-made path can leave a real external reference in that state; when a path stands
   * before the group, or the group itself opens with one, both are hidden all the same.
   */
  table(start: number, end: number): void {
    const inner = this.text.slice(start + 1, end - 1);
    const before = this.pathBefore(start);
    if (before === 0 && !STARTS_WITH_PATH.test(inner)) return;
    this.add(start - before, end, `[${fileNameOf(inner)}]`);
  }

  /**
   * A quoted prefix, `text.slice(start, end)`. One that holds a bracket, `'C:\dir\[Book.xlsx]Sheet'`,
   * becomes `'[Book.xlsx]Sheet'`; text before the bracket that is not a path stays. One without a
   * bracket that holds a separator and is followed by `!` is the display form of an external name,
   * `'C:\dir\Book.xlsx'!Name`, and becomes `'[Book.xlsx]'!Name` (a sheet name never holds a
   * separator). A path that stands before the quote (`C:\dir\john's\[Book.xlsx]`) goes with it.
   */
  quoted(start: number, end: number, reference: boolean): void {
    const raw = this.text.slice(start, end);
    const open = raw.indexOf('[');
    const close = open < 0 ? -1 : raw.indexOf(']', open);
    if (close >= 0) this.bracketQuoted(start, raw.slice(0, close + 1), reference);
    else if (reference && open < 0 && SEPARATOR.test(raw)) this.wholeQuoted(start, end, raw);
  }

  /** `head` is the quoted text up to and with the bracket's `]`: `'C:\dir\[Book.xlsx]`. */
  private bracketQuoted(start: number, head: string, reference: boolean): void {
    const open = head.indexOf('[');
    const prefix = head.slice(1, open);
    const path = PREFIX_PATH.test(prefix);
    if (!reference && !path) return;
    const from = path ? start - this.pathBefore(start) : start;
    const name = this.bookName(head.slice(open + 1, -1));
    this.add(from, start + head.length, `'${path ? '' : prefix}[${name}]`);
  }

  /** `'C:\dir\Book.xlsx'` (closed or not) as `'[Book.xlsx]'`, with any path before the quote. */
  private wholeQuoted(start: number, end: number, raw: string): void {
    const closed = raw.length > 1 && raw.endsWith("'");
    const inner = raw.slice(1, closed ? -1 : undefined);
    const text = `'[${fileNameOf(inner)}]${closed ? "'" : ''}`;
    this.add(start - this.pathBefore(start), end, text);
  }

  /**
   * A bracket the scanner cut before its end. The first one in a formula is read to its `]` (one search,
   * never one per bracket) and, if it holds a path, written as the file name; the position after it is
   * returned, else undefined.
   */
  long(start: number, readTo: number): number | undefined {
    if (this.longDone) return undefined;
    this.longDone = true;
    const close = this.text.indexOf(']', readTo);
    if (close < 0 || !SEPARATOR.test(this.text.slice(start + 1, close))) return undefined;
    this.add(
      start - this.pathBefore(start),
      close + 1,
      `[${fileNameOf(this.text.slice(start + 1, close))}]`,
    );
    return close + 1;
  }
}

/** The text with the edits applied; the edits are in text order and do not overlap. */
export function applyEdits(text: string, edits: readonly TextEdit[], limit: number): string {
  let out = '';
  let at = 0;
  for (const edit of edits) {
    if (edit.end > limit) break;
    out += text.slice(at, edit.start) + edit.text;
    at = edit.end;
  }
  return out + text.slice(at, limit);
}
