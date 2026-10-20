// RF-155, RFC-005 section 4.7, ADR-004: which part of a snapshot is a rendered workbook. The
// guidance for workbooks is chosen from the folders a snapshot record lists (`snapshot.json`), never
// from the names or the content of the files, so the universal scan and the agents keep no logic
// of one kind of file.

/** The folders of the rendered workbooks a snapshot record lists, in the order it lists them. */
export function workbookFoldersOf(info: {
  readonly kind?: string | undefined;
  readonly workbooks?: readonly { readonly folder: string }[] | undefined;
}): readonly string[] {
  return (info.workbooks ?? []).map((workbook) => workbook.folder);
}

/** Whether a file path lies inside the folder (a whole path segment, not a name prefix). */
function isInside(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}

/** Whether an area holds a file of a rendered workbook folder. */
export function areaHoldsWorkbook(
  area: { readonly files: readonly string[] },
  folders: readonly string[] | undefined,
): boolean {
  if (folders === undefined || folders.length === 0) return false;
  return area.files.some((path) => folders.some((folder) => isInside(path, folder)));
}
