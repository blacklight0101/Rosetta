// RF-155, RF-301, RF-208, P3-105: the files Rosetta writes to show a workbook as text. They are
// Rosetta's view of the workbook, never part of it: a claim about one of them describes Rosetta,
// not the system, and a rule is shown by the formula, not by the value the formula gave. A file
// counts as rendered only inside a folder the snapshot record lists as a rendered workbook
// (ADR-004): a `docs/notes.md` of a code project is a file like any other.

const RENDERED_FILE_NAMES = [
  'workbook.md',
  'dependencies.md',
  'values.md',
  'formulas.md',
  'validation.md',
  'notes.md',
  'workbook-formulas.md',
] as const;

/** The last segment of a repository path. */
function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function isInsideFolder(path: string, folders: readonly string[]): boolean {
  return folders.some((folder) => path.startsWith(`${folder}/`));
}

/** Whether the path is one of the rendered files of one of these rendered workbook folders. */
export function isRenderedFile(path: string, folders: readonly string[] = []): boolean {
  if (!isInsideFolder(path, folders)) return false;
  return (RENDERED_FILE_NAMES as readonly string[]).includes(baseNameOf(path).toLowerCase());
}

/** The rendered file names a text mentions (`workbook.md`, not `myworkbook.md`), in the order written. */
export function renderedFileNamesIn(text: string): readonly string[] {
  const lower = text.toLowerCase();
  return RENDERED_FILE_NAMES.filter((name) => {
    for (let at = lower.indexOf(name); at >= 0; at = lower.indexOf(name, at + 1)) {
      if (!/[\w.-]/u.test(lower.charAt(at - 1))) return true;
    }
    return false;
  });
}

/** A values file of a sheet inside one of these rendered workbook folders. */
export function isValuesFile(path: string, folders: readonly string[] = []): boolean {
  return isInsideFolder(path, folders) && baseNameOf(path).toLowerCase() === 'values.md';
}
