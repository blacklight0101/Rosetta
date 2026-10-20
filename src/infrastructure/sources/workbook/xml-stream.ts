import { SaxesParser } from 'saxes';
import { workbookNotReadable, workbookXmlRefused } from './workbook-errors.js';

// RF-151, ADR-023: every XML part is read as a stream of events by `saxes`, a non-validating parser
// that resolves no external entity. A part is refused on its document type (so no entity can be
// declared, internal or external) and on nesting deeper than 64; nothing is held but what a
// visitor keeps.

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

  constructor(part: string, visitor: XmlVisitor) {
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
      visitor.open?.(localName(tag.name), tag.attributes);
    });
    this.parser.on('closetag', (tag) => {
      depth -= 1;
      visitor.close?.(localName(tag.name));
    });
    this.parser.on('text', (text) => visitor.text?.(text));
    this.parser.on('cdata', (text) => visitor.text?.(text));
  }

  write(text: string): void {
    this.parser.write(text);
  }

  /** Ends the part; an element left open is "not well formed". */
  end(): void {
    this.parser.close();
  }
}
