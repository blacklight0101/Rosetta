import { buildGrid, type SheetGrid } from './dependency-grid.js';
import { fileNameOf } from './external-names.js';
import { extractReferences } from './formula-references.js';
import type { RefBox } from './reference-box.js';
import type { TableShape } from './table-reference.js';
import type { DefinedName, WorkbookModel, WorkbookSheet } from './workbook-model.js';

// RF-153: the workbooks and sheets of one project as the map sees them: a number for every sheet, the
// label it is written with (the folder names of the rendered tree), and the lookups a reference needs
// (a sheet by name, a workbook by file name, a table by name, a defined name).

/** What the map needs of a rendered workbook: its folder and the segments of its names. */
export interface RenderedNames {
  readonly folder: string;
  /** The workbook first, then its sheets in tab order. */
  readonly names: readonly { readonly segment: string }[];
}

export interface SheetNode {
  /** Global, in workbook order and then tab order. */
  readonly id: number;
  readonly workbook: number;
  /** The position in the tab order of its workbook. */
  readonly local: number;
  readonly sheet: WorkbookSheet;
  /** `Pricing.xlsx/Summary`: the folder and sheet segment of the rendered tree. */
  readonly path: string;
  readonly grid: SheetGrid;
  /** The node number of each cell of the grid that holds a formula, else -1. */
  formulaIds: Int32Array;
}

export interface TableNode extends TableShape {
  readonly sheet: SheetNode;
  readonly name: string;
}

export interface WorkbookNode {
  readonly index: number;
  readonly model: WorkbookModel;
  readonly folder: string;
  readonly sheets: readonly SheetNode[];
  readonly sheetByName: ReadonlyMap<string, SheetNode>;
  readonly tableByName: ReadonlyMap<string, TableNode>;
  /** Lower-case names defined in the workbook, for the tokenizer. */
  readonly nameSet: ReadonlySet<string>;
  readonly definedByKey: ReadonlyMap<string, DefinedName>;
  /** The file name of each external link, in link order (the first link is `[1]`). */
  readonly linkNames: readonly string[];
  readonly tables: readonly TableNode[];
}

export interface Project {
  readonly workbooks: readonly WorkbookNode[];
  readonly sheets: readonly SheetNode[];
  /** Workbooks by lower-case file name; the first of two equal names wins. */
  readonly byFileName: ReadonlyMap<string, WorkbookNode>;
}

export function nameKey(sheet: string | undefined, name: string): string {
  return `${sheet?.toLowerCase() ?? ''}\u0000${name.toLowerCase()}`;
}

function boxOfRange(range: string): RefBox | undefined {
  const [first] = extractReferences(range).references;
  return first?.kind === 'range' ? first.box : undefined;
}

function tablesOf(sheets: readonly SheetNode[]): TableNode[] {
  return sheets.flatMap((sheet) =>
    sheet.sheet.tables.flatMap((table) => {
      const box = boxOfRange(table.range);
      return box === undefined ? [] : [{ sheet, name: table.name, box, columns: table.columns }];
    }),
  );
}

function workbookNode(
  model: WorkbookModel,
  index: number,
  rendered: RenderedNames | undefined,
  firstId: number,
): WorkbookNode {
  const folder = rendered?.folder ?? model.fileName;
  const segments = rendered?.names.slice(1).map((name) => name.segment) ?? [];
  const sheets = model.sheets.map((sheet, local): SheetNode => ({
    id: firstId + local,
    workbook: index,
    local,
    sheet,
    path: `${folder}/${segments[local] ?? sheet.name}`,
    grid: buildGrid(sheet),
    formulaIds: new Int32Array(0),
  }));
  const tables = tablesOf(sheets);
  return {
    index,
    model,
    folder,
    sheets,
    sheetByName: new Map(sheets.map((s) => [s.sheet.name.toLowerCase(), s])),
    tableByName: new Map(tables.map((t) => [t.name.toLowerCase(), t])),
    nameSet: new Set(model.definedNames.map((d) => d.name.toLowerCase())),
    definedByKey: new Map(model.definedNames.map((d) => [nameKey(d.sheet, d.name), d])),
    linkNames: model.externalLinks.map((link) => fileNameOf(link.fileName)),
    tables,
  };
}

export function buildProject(
  models: readonly WorkbookModel[],
  rendered: readonly RenderedNames[],
): Project {
  const workbooks: WorkbookNode[] = [];
  let firstId = 0;
  models.forEach((model, index) => {
    const node = workbookNode(model, index, rendered[index], firstId);
    workbooks.push(node);
    firstId += node.sheets.length;
  });
  const byFileName = new Map<string, WorkbookNode>();
  for (const workbook of workbooks) {
    const key = fileNameOf(workbook.model.fileName).toLowerCase();
    if (!byFileName.has(key)) byFileName.set(key, workbook);
  }
  return { workbooks, sheets: workbooks.flatMap((w) => w.sheets), byFileName };
}
