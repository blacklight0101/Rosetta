// RF-155, RFC-005 section 4.7: stub for the red commit.

/** The folders of the rendered workbooks a snapshot record lists. */
export function workbookFoldersOf(info: {
  readonly workbooks?: readonly { readonly folder: string }[] | undefined;
}): readonly string[] {
  return info.workbooks === undefined ? [] : [];
}

/** Whether an area holds a file of a rendered workbook folder. */
export function areaHoldsWorkbook(
  area: { readonly files: readonly string[] },
  folders: readonly string[] | undefined,
): boolean {
  return area.files.length < 0 && folders !== undefined;
}
