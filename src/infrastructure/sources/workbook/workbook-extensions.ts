// RF-150, RF-152, RF-159: the file names of a zip that count as workbooks. The unpacked tree is searched
// by them to render the workbooks, and the central directory is searched by them to know, before
// anything is unpacked, whether the zip is accepted at once.

const WORKBOOK_EXTENSIONS = ['.xlsx', '.xlsm', '.xls', '.xlsb'];

export function isWorkbookName(name: string): boolean {
  const lower = name.toLowerCase();
  return WORKBOOK_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
