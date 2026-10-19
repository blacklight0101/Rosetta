import type { DataConnection, PivotTable, SheetComment, WorkbookTable } from './workbook-model.js';
import type { Attributes, XmlVisitor } from './xml-stream.js';

// RF-151, RF-152: the small parts a sheet points at (comments, tables, pivot tables, charts) and
// `xl/connections.xml`. Each is read for names and addresses; nothing is opened or evaluated.

/** Comments: the address and the text. The `authors` list is never collected (Q-39). */
export class CommentsReader implements XmlVisitor {
  readonly comments: SheetComment[] = [];
  private address: string | undefined;
  private pieces: string[] = [];
  private collecting = false;
  private inBody = false;
  private phonetic = 0;

  open(name: string, attributes: Attributes): void {
    if (name === 'comment') {
      this.address = attributes['ref'];
      this.pieces = [];
    } else if (name === 'text') {
      this.inBody = true;
    } else if (name === 'rPh') {
      this.phonetic += 1;
    } else if (name === 't') {
      this.collecting = this.inBody && this.phonetic === 0;
    }
  }

  text(text: string): void {
    if (this.collecting) this.pieces.push(text);
  }

  close(name: string): void {
    if (name === 't') {
      this.collecting = false;
    } else if (name === 'rPh') {
      this.phonetic -= 1;
    } else if (name === 'text') {
      this.inBody = false;
    } else if (name === 'comment' && this.address !== undefined) {
      this.comments.push({ address: this.address, text: this.pieces.join('') });
      this.address = undefined;
    }
  }
}

/** A table definition: its name, range and column names. */
export class TableReader implements XmlVisitor {
  table: WorkbookTable | undefined;
  private name = '';
  private range = '';
  private readonly columns: string[] = [];

  open(name: string, attributes: Attributes): void {
    if (name === 'table') {
      this.name = attributes['displayName'] ?? attributes['name'] ?? '';
      this.range = attributes['ref'] ?? '';
    } else if (name === 'tableColumn') {
      this.columns.push(attributes['name'] ?? '');
    }
  }

  close(name: string): void {
    if (name === 'table') {
      this.table = { name: this.name, range: this.range, columns: this.columns };
    }
  }
}

/** A pivot table definition: its name and where it sits. */
export class PivotReader implements XmlVisitor {
  pivot: PivotTable | undefined;
  private name = '';
  private range: string | undefined;

  open(name: string, attributes: Attributes): void {
    if (name === 'pivotTableDefinition') this.name = attributes['name'] ?? '';
    else if (name === 'location') this.range = attributes['ref'];
  }

  close(name: string): void {
    if (name === 'pivotTableDefinition') {
      this.pivot = { name: this.name, ...(this.range === undefined ? {} : { range: this.range }) };
    }
  }
}

/** A chart part: the kinds of plot it holds (`barChart`, `lineChart`, ...). */
export class ChartReader implements XmlVisitor {
  readonly kinds: string[] = [];

  open(name: string): void {
    if (name.length > 'Chart'.length && name.endsWith('Chart')) this.kinds.push(name);
  }
}

/** Connections by name and type; the connection string is never read (Q-34). */
export class ConnectionsReader implements XmlVisitor {
  readonly connections: DataConnection[] = [];

  open(name: string, attributes: Attributes): void {
    if (name !== 'connection') return;
    const type = attributes['type'];
    this.connections.push({
      name: attributes['name'] ?? '',
      ...(type === undefined || !Number.isInteger(Number(type))
        ? {}
        : { sourceType: Number(type) }),
    });
  }
}
