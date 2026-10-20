import { SaxesParser } from 'saxes';
import { workbookNotReadable, workbookTooLarge, workbookXmlRefused } from './workbook-errors.js';

// RF-151, ADR-023: every XML part is read as a stream of events by `saxes`, a non-validating parser
// that resolves no external entity. A part is refused on its document type (so no entity can be
// declared, internal or external) and on nesting deeper than 64; nothing is held but what a
// visitor keeps. The parser holds one text value (a text node, a CDATA section, a comment or an
// attribute) whole until it ends, so the length of what it holds is judged after every chunk.

export type Attributes = Readonly<Record<string, string>>;

/** What a part reader hears. Element names are local names: a namespace prefix is cut off. */
export interface XmlVisitor {
  open?(name: string, attributes: Attributes): void;
  text?(text: string): void;
  close?(name: string): void;
}

/** RF-151: elements nested deeper than this are refused. */
const MAX_NESTING = 64;

function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1);
}

/** The value of the attribute that names a relationship (`r:id`, whatever the prefix is). */
export function relationshipId(attributes: Attributes): string | undefined {
  const found = Object.entries(attributes).find(([key]) => key.endsWith(':id'));
  return found?.[1];
}

/** Feeds the text of one part to a visitor, under the guards. */
export class XmlFeeder {
  private readonly parser = new SaxesParser();
  private readonly maxTextChars: number;

  constructor(part: string, visitor: XmlVisitor, maxTextChars: number) {
    this.maxTextChars = maxTextChars;
    let depth = 0;
    this.parser.on('error', (error) => {
      throw workbookNotReadable(part, 'the XML is not well formed', error);
    });
    this.parser.on('doctype', () => {
      throw workbookXmlRefused(part, 'holds a document type or an entity declaration');
    });
    this.parser.on('opentag', (tag) => {
      depth += 1;
      if (depth > MAX_NESTING) {
        throw workbookXmlRefused(part, `nests elements deeper than ${String(MAX_NESTING)}`);
      }
      for (const value of Object.values(tag.attributes)) this.checkLength(value.length);
      visitor.open?.(localName(tag.name), tag.attributes);
    });
    this.parser.on('closetag', (tag) => {
      depth -= 1;
      visitor.close?.(localName(tag.name));
    });
    for (const event of ['text', 'cdata'] as const) {
      this.parser.on(event, (text) => {
        this.checkLength(text.length);
        visitor.text?.(text);
      });
    }
  }

  write(text: string): void {
    this.parser.write(text);
    this.checkHeld();
  }

  /**
   * RST-1926: the text or the name the parser is still collecting is longer than the cap. Its
   * fields are not in its typed interface, so they are read as unknown; a field it does not have
   * is never too long (the test of a 100 MB node fails if a new version renames them).
   */
  private checkHeld(): void {
    for (const field of ['text', 'name']) {
      const held: unknown = Reflect.get(this.parser, field);
      if (typeof held === 'string') this.checkLength(held.length);
    }
  }

  private checkLength(length: number): void {
    if (length > this.maxTextChars) {
      throw workbookTooLarge('characters in one XML text value', this.maxTextChars);
    }
  }

  /** Ends the part; an element left open is "not well formed". */
  end(): void {
    this.parser.close();
  }
}
