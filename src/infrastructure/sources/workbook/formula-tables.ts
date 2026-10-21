import { positionOf } from './cell-order.js';
import type { WorkbookTable } from './workbook-model.js';
import { NAME_CAP, quoteText } from './workbook-text.js';

// RF-152, P3-94: which table column a formula cell fills. A table's range and column names come
// from the file; its first row is the header, the rows below it are the data rows (a totals row is
// one of them). A cell outside every table, in a header or in a column the table does not list is
// in no column, and nothing is named for it.

/** The table and the column a cell fills. */
export interface TableColumn {
  readonly table: string;
  readonly column: string;
}

/** Where a cell is: its 0-based column and its row. */
export type ColumnLocator = (column: number, row: number) => TableColumn | undefined;

interface Placed {
  readonly name: string;
  readonly columns: readonly string[];
  readonly c1: number;
  readonly c2: number;
  readonly r1: number;
  readonly r2: number;
}

const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/u;

function placedOf(table: WorkbookTable): Placed | undefined {
  const [from, to = from] = table.range.split(':');
  const first = from === undefined ? undefined : positionOf(from);
  const last = positionOf(to ?? '');
  if (first === undefined || last === undefined) return undefined;
  const { name, columns } = table;
  const [c1, c2] = [Math.min(first.column, last.column), Math.max(first.column, last.column)];
  const [r1, r2] = [Math.min(first.row, last.row), Math.max(first.row, last.row)];
  return { name, columns, c1, c2, r1, r2 };
}

/** A locator over the tables of one sheet; the first table that holds the cell answers. */
export function tableLocator(tables: readonly WorkbookTable[]): ColumnLocator {
  const placed = tables.flatMap((table) => placedOf(table) ?? []);
  return (column, row) => {
    for (const each of placed) {
      const inside = column >= each.c1 && column <= each.c2 && row > each.r1 && row <= each.r2;
      const name = inside ? each.columns[column - each.c1] : undefined;
      if (name !== undefined) return { table: each.name, column: name };
    }
    return undefined;
  };
}

/** `InvoiceTable column "Agreed Amount Total"`; a table name that is not a plain identifier is quoted. */
export function tableColumnText(at: TableColumn): string {
  const table =
    PLAIN_NAME.test(at.table) && at.table.length <= NAME_CAP
      ? at.table
      : quoteText(at.table, NAME_CAP);
  return `${table} column ${quoteText(at.column, NAME_CAP)}`;
}

function cornerOf(range: string): { column: number; row: number }[] {
  const [from, to = from] = range.split(':');
  return [from, to].flatMap((corner) => positionOf(corner ?? '') ?? []);
}

/** The table column both ends of a range fill, when they are in one column of one table. */
export function rangeColumn(locate: ColumnLocator, range: string): TableColumn | undefined {
  const [first, last] = cornerOf(range);
  if (first === undefined || last === undefined) return undefined;
  if (first.column !== last.column) return undefined;
  const top = locate(first.column, first.row);
  const bottom = locate(last.column, last.row);
  if (top === undefined || bottom === undefined) return undefined;
  return top.table === bottom.table ? top : undefined;
}
