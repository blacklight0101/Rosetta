// RF-155, RF-301, RF-208, P3-105: the files Rosetta writes to show a workbook as text. They are
// Rosetta's view of the workbook, never part of it: a claim about one of them describes Rosetta,
// not the system, and a rule is shown by the formula, not by the value the formula gave.

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

/** Whether the path is one of the rendered files, in any folder. */
export function isRenderedFile(path: string): boolean {
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

/** A values file of a sheet: `Pricing.xlsx/Quote/values.md`, with a folder above it. */
export function isValuesFile(path: string): boolean {
  return path.includes('/') && baseNameOf(path).toLowerCase() === 'values.md';
}
