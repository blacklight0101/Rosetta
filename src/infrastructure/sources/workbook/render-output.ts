import { workbookTooLarge } from './workbook-errors.js';
import { cutLine, MAX_LINE } from './workbook-text.js';

// RF-146, RF-151, RF-152: the lines of a rendered file and the byte limit of a whole render. Every
// line goes through `TextFile.add`, which cuts it under the line limit and counts its bytes, so no
// writer can produce a line or a total the limits forbid.

/** The bytes of rendered text one render may produce, across all its workbooks. */
export class ByteBudget {
  private used = 0;
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  take(bytes: number): void {
    this.used += bytes;
    if (this.used > this.max) throw workbookTooLarge('bytes of rendered text', this.max);
  }
}

export class TextFile {
  private readonly lines: string[] = [];
  private readonly budget: ByteBudget;

  constructor(budget: ByteBudget) {
    this.budget = budget;
  }

  get lineCount(): number {
    return this.lines.length;
  }

  add(line = ''): void {
    const cut = cutLine(line);
    this.budget.take(Buffer.byteLength(cut) + 1);
    this.lines.push(cut);
  }

  /** A blank line, then a heading. */
  section(heading: string): void {
    this.add();
    this.add(heading);
  }

  /**
   * Items joined by `separator`; a line that would pass the limit continues on the next, which starts
   * with the same `prefix` (the row of RF-152, or the label of a list).
   */
  addWrapped(prefix: string, items: readonly string[], separator: string): void {
    let line = prefix;
    let empty = true;
    for (const item of items) {
      const next = empty ? `${prefix}${item}` : `${line}${separator}${item}`;
      if (!empty && next.length > MAX_LINE) {
        this.add(line);
        line = `${prefix}${item}`;
      } else {
        line = next;
      }
      empty = false;
    }
    this.add(line);
  }

  text(): string {
    return `${this.lines.join('\n')}\n`;
  }
}
