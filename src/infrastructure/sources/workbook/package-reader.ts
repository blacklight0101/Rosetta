import type { LimitCounter } from '../entry-guards.js';
import { CellReader } from './cell-reader.js';
import { RuleReader } from './rule-reader.js';
import { SharedStringsReader } from './shared-strings-reader.js';
import {
  ChartReader,
  CommentsReader,
  ConnectionsReader,
  PivotReader,
  TableReader,
} from './small-part-readers.js';
import { StylesReader } from './styles-reader.js';
import { workbookLegacyFormat, workbookNotReadable } from './workbook-errors.js';
import type { WorkbookLimits } from './workbook-limits.js';
import type { DefinedName, ExternalLink, WorkbookModel, WorkbookSheet } from './workbook-model.js';
import type { Relationship, WorkbookPackage } from './workbook-package.js';
import { WorkbookXmlReader, type SheetEntry } from './workbook-xml-reader.js';
import type { XmlVisitor } from './xml-stream.js';

// RF-151, RF-152: assembles the model of one workbook package from its parts, in the order that
// lets each part be read once: workbook, strings, styles, then every sheet with what it points at.

const WORKBOOK_PART = 'xl/workbook.xml';
const SHARED_STRINGS_PART = 'xl/sharedStrings.xml';
const STYLES_PART = 'xl/styles.xml';
const CONNECTIONS_PART = 'xl/connections.xml';

class SheetPartReader implements XmlVisitor {
  readonly cells: CellReader;
  readonly rules = new RuleReader();

  constructor(cells: CellReader) {
    this.cells = cells;
  }

  open(name: string, attributes: Record<string, string>): void {
    this.cells.open(name, attributes);
    this.rules.open(name, attributes);
  }

  text(text: string): void {
    this.cells.text(text);
    this.rules.text(text);
  }

  close(name: string): void {
    this.cells.close(name);
    this.rules.close(name);
  }
}

function fileNameOf(target: string): string {
  const last = target.split(/[\\/]/).pop() ?? target;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export class PackageReader {
  private readonly pkg: WorkbookPackage;
  private readonly fileName: string;
  private readonly limits: WorkbookLimits;
  private readonly budget: LimitCounter;

  constructor(
    pkg: WorkbookPackage,
    fileName: string,
    limits: WorkbookLimits,
    budget: LimitCounter,
  ) {
    this.pkg = pkg;
    this.fileName = fileName;
    this.limits = limits;
    this.budget = budget;
  }

  async read(): Promise<WorkbookModel> {
    if (this.pkg.has('xl/workbook.bin')) {
      throw workbookLegacyFormat(this.fileName, 'an .xlsb (binary) workbook');
    }
    const workbook = new WorkbookXmlReader(this.fileName, this.limits.maxSheets);
    await this.pkg.stream(WORKBOOK_PART, workbook);
    const relationships = await this.pkg.relationships(WORKBOOK_PART);
    const strings = await this.sharedStrings(relationships);
    const styles = new StylesReader();
    if (this.pkg.has(STYLES_PART)) await this.pkg.stream(STYLES_PART, styles);
    const sheets: WorkbookSheet[] = [];
    for (const entry of workbook.sheets) {
      sheets.push(await this.readSheet(entry, relationships, strings, styles));
    }
    return {
      fileName: this.fileName,
      date1904: workbook.date1904,
      sheets,
      definedNames: workbook.names.map((name): DefinedName => {
        const sheet = name.sheetIndex === undefined ? undefined : sheets[name.sheetIndex]?.name;
        return {
          name: name.name,
          ...(sheet === undefined ? {} : { sheet }),
          hidden: name.hidden,
          refersTo: name.refersTo,
        };
      }),
      externalLinks: await this.externalLinks(workbook.externalRelationships, relationships),
      connections: await this.connections(),
      hasMacros: this.pkg.has('xl/vbaProject.bin'),
      sharedStringCount: strings.length,
    };
  }

  private async sharedStrings(relationships: readonly Relationship[]): Promise<string[]> {
    const target = relationships.find((rel) => rel.type === 'sharedStrings')?.target;
    const part = target ?? SHARED_STRINGS_PART;
    if (!this.pkg.has(part)) return [];
    const reader = new SharedStringsReader(this.limits.maxCells);
    await this.pkg.stream(part, reader);
    return reader.strings;
  }

  private async readSheet(
    entry: SheetEntry,
    relationships: readonly Relationship[],
    strings: readonly string[],
    styles: StylesReader,
  ): Promise<WorkbookSheet> {
    const relationship = relationships.find((rel) => rel.id === entry.relationship);
    if (relationship === undefined) {
      throw workbookNotReadable(
        'xl/_rels/workbook.xml.rels',
        `the sheet ${JSON.stringify(entry.name)} has no relationship`,
      );
    }
    const part = relationship.target;
    const cells = new CellReader({
      part,
      strings,
      formatOf: (style) => styles.formatOf(style),
      budget: this.budget,
      maxCells: this.limits.maxCells,
    });
    const reader = new SheetPartReader(cells);
    await this.pkg.stream(part, reader);
    const extras = await this.sheetExtras(part);
    return {
      name: entry.name,
      state: entry.state,
      part,
      ...(reader.rules.usedRange === undefined ? {} : { usedRange: reader.rules.usedRange }),
      cells: cells.cells,
      mergedRanges: reader.rules.mergedRanges,
      validations: reader.rules.validations,
      conditionalRules: reader.rules.conditionalRules,
      ...extras,
    };
  }

  /** Comments, tables, pivot tables and charts the sheet's relationships point at. */
  private async sheetExtras(
    sheetPart: string,
  ): Promise<Pick<WorkbookSheet, 'comments' | 'tables' | 'pivots' | 'charts'>> {
    const comments = [];
    const tables = [];
    const pivots = [];
    const charts: string[] = [];
    for (const rel of await this.pkg.relationships(sheetPart)) {
      if (rel.external) continue;
      if (rel.type === 'comments') {
        const reader = new CommentsReader();
        await this.pkg.stream(rel.target, reader);
        comments.push(...reader.comments);
      } else if (rel.type === 'table') {
        const reader = new TableReader();
        await this.pkg.stream(rel.target, reader);
        if (reader.table !== undefined) tables.push(reader.table);
      } else if (rel.type === 'pivotTable') {
        const reader = new PivotReader();
        await this.pkg.stream(rel.target, reader);
        if (reader.pivot !== undefined) pivots.push(reader.pivot);
      } else if (rel.type === 'drawing') {
        charts.push(...(await this.chartsOf(rel.target)));
      }
    }
    return { comments, tables, pivots, charts };
  }

  private async chartsOf(drawingPart: string): Promise<string[]> {
    const kinds: string[] = [];
    for (const rel of await this.pkg.relationships(drawingPart)) {
      if (rel.external || rel.type !== 'chart') continue;
      const reader = new ChartReader();
      await this.pkg.stream(rel.target, reader);
      kinds.push(...reader.kinds);
    }
    return kinds;
  }

  /** Links to other workbooks, by file name only; the target is never opened. */
  private async externalLinks(
    ids: readonly string[],
    relationships: readonly Relationship[],
  ): Promise<ExternalLink[]> {
    const links: ExternalLink[] = [];
    for (const id of ids) {
      const part = relationships.find((rel) => rel.id === id)?.target;
      if (part === undefined) continue;
      if (!this.pkg.has(part)) throw workbookNotReadable(part, 'the part is missing');
      for (const rel of await this.pkg.relationships(part)) {
        if (rel.external) links.push({ fileName: fileNameOf(rel.target) });
      }
    }
    return links;
  }

  private async connections(): Promise<ConnectionsReader['connections']> {
    if (!this.pkg.has(CONNECTIONS_PART)) return [];
    const reader = new ConnectionsReader();
    await this.pkg.stream(CONNECTIONS_PART, reader);
    return reader.connections;
  }
}
