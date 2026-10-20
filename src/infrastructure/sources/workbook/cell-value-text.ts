import type { WorkbookCell } from './workbook-model.js';

// RF-152: stub, replaced by the implementation in the next commit.
export function bareValue(cell: WorkbookCell, date1904: boolean): string | undefined {
  return date1904 ? cell.address : undefined;
}
export function valueField(cell: WorkbookCell, date1904: boolean): string {
  return date1904 ? cell.address : '';
}
