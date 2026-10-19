import { LimitCounter } from '../entry-guards.js';
import { workbookTooLarge } from './workbook-errors.js';
import type { XmlVisitor } from './xml-stream.js';

// RF-151: `xl/sharedStrings.xml`. Each `<si>` is counted against the cell limit while it streams,
// so a table with more strings than the limit is stopped where it passes it. Phonetic runs
// (`rPh`) are furigana, not content, and are left out.

export class SharedStringsReader implements XmlVisitor {
  readonly strings: string[] = [];
  private readonly counter: LimitCounter;
  private readonly limit: number;
  private current: string[] | undefined;
  private phonetic = 0;
  private inText = false;

  constructor(limit: number) {
    this.limit = limit;
    this.counter = new LimitCounter(limit);
  }

  open(name: string): void {
    if (name === 'si') {
      this.current = [];
      if (!this.counter.add()) throw workbookTooLarge('shared strings', this.limit);
    } else if (name === 'rPh') {
      this.phonetic += 1;
    } else if (name === 't') {
      this.inText = this.phonetic === 0;
    }
  }

  text(text: string): void {
    if (this.inText) this.current?.push(text);
  }

  close(name: string): void {
    if (name === 'si') {
      this.strings.push(this.current?.join('') ?? '');
      this.current = undefined;
    } else if (name === 'rPh') {
      this.phonetic -= 1;
    } else if (name === 't') {
      this.inText = false;
    }
  }
}
