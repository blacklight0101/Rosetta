import { workbookTooManySheets } from './workbook-errors.js';
import type { SheetState } from './workbook-model.js';
import { relationshipId, type Attributes, type XmlVisitor } from './xml-stream.js';

// RF-151: `xl/workbook.xml`: the sheets in order, the defined names and the pointers to external
// links. Sheets are counted as they stream, so a workbook over the limit stops at the sheet that
// passes it, before any sheet part is opened.

export interface SheetEntry {
  readonly name: string;
  readonly state: SheetState;
  readonly relationship: string | undefined;
}

export interface NameEntry {
  readonly name: string;
  readonly sheetIndex: number | undefined;
  readonly hidden: boolean;
  readonly refersTo: string;
}

function isTrue(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

function stateOf(value: string | undefined): SheetState {
  return value === 'hidden' || value === 'veryHidden' ? value : 'visible';
}

export class WorkbookXmlReader implements XmlVisitor {
  readonly sheets: SheetEntry[] = [];
  readonly names: NameEntry[] = [];
  readonly externalRelationships: string[] = [];
  date1904 = false;
  private readonly fileName: string;
  private readonly maxSheets: number;
  private pending: Omit<NameEntry, 'refersTo'> | undefined;
  private nameText = '';

  constructor(fileName: string, maxSheets: number) {
    this.fileName = fileName;
    this.maxSheets = maxSheets;
  }

  open(name: string, attributes: Attributes): void {
    if (name === 'sheet') this.startSheet(attributes);
    else if (name === 'workbookPr') this.date1904 = isTrue(attributes['date1904']);
    else if (name === 'definedName') this.startName(attributes);
    else if (name === 'externalReference') this.addExternal(attributes);
  }

  private startSheet(attributes: Attributes): void {
    if (this.sheets.length >= this.maxSheets) {
      throw workbookTooManySheets(this.fileName, this.maxSheets);
    }
    this.sheets.push({
      name: attributes['name'] ?? '',
      state: stateOf(attributes['state']),
      relationship: relationshipId(attributes),
    });
  }

  private startName(attributes: Attributes): void {
    const local = attributes['localSheetId'];
    this.pending = {
      name: attributes['name'] ?? '',
      sheetIndex: local === undefined ? undefined : Number(local),
      hidden: isTrue(attributes['hidden']),
    };
    this.nameText = '';
  }

  private addExternal(attributes: Attributes): void {
    const id = relationshipId(attributes);
    if (id !== undefined) this.externalRelationships.push(id);
  }

  text(text: string): void {
    if (this.pending !== undefined) this.nameText += text;
  }

  close(name: string): void {
    if (name === 'definedName' && this.pending !== undefined) {
      this.names.push({ ...this.pending, refersTo: this.nameText });
      this.pending = undefined;
    }
  }
}
