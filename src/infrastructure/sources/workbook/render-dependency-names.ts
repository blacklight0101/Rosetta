import { boxText, rangesOf } from './cell-runs.js';
import type { Project } from './dependency-project.js';
import { nameTargets } from './dependency-scope.js';
import type { Findings } from './dependency-store.js';
import type { TextFile } from './render-output.js';
import type { DefinedName } from './workbook-model.js';
import { NAME_CAP, quoteText, splitText } from './workbook-text.js';

// RF-153, RFC-005 section 4.5: the sections of `dependencies.md` about defined names, references that
// cannot be resolved, and dynamic references. Every line starts with the cells it describes (the
// sheet folder and a range) or, for a name with no cells, the workbook folder; a long target is
// written on continuation lines, never cut.

const REFERS_CHUNK = 600;
const q = (text: string): string => quoteText(text, NAME_CAP);

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function byScopeAndName(a: DefinedName, b: DefinedName): number {
  return (
    (a.sheet ?? '').toLowerCase().localeCompare((b.sheet ?? '').toLowerCase()) ||
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
    a.name.localeCompare(b.name)
  );
}

function addName(
  file: TextFile,
  context: { project: Project; findings: Findings; prefix: string },
  name: DefinedName,
): void {
  const local = name.sheet === undefined ? '' : ` (local to the sheet ${q(name.sheet)})`;
  const head = `${context.prefix} name ${q(name.name)}${local}`;
  splitText(name.refersTo, REFERS_CHUNK, true).forEach((piece, index) => {
    file.add(`${head} refers to ${index === 0 ? '' : '(continued) '}"${piece}"`);
  });
  const users = [...(context.findings.nameUsers.get(name) ?? [])].sort((a, b) => a[0] - b[0]);
  if (users.length === 0) file.add(`${head} is not used by any formula`);
  for (const [sheetId, count] of users) {
    const path = context.project.sheets[sheetId]?.path ?? '';
    file.add(`${head} used by ${path} (${plural(count, 'formula')})`);
  }
}

/** Defined names with their targets and the sheets whose formulas use them. */
export function addDefinedNames(file: TextFile, project: Project, findings: Findings): void {
  file.section('## Defined names');
  let any = false;
  for (const book of project.workbooks) {
    for (const name of [...book.model.definedNames].sort(byScopeAndName)) {
      any = true;
      const first = nameTargets(project, book, name).boxes[0];
      const prefix =
        first === undefined ? book.folder : `${first.sheet.path}!${boxText(first.box)}`;
      addName(file, { project, findings, prefix }, name);
    }
  }
  if (!any) file.add('None.');
}

interface Line {
  readonly sheet: number;
  readonly order: string;
  readonly position: number;
  readonly text: string;
}

function linesOf(
  project: Project,
  entry: { sheet: number; positions: number[] },
  order: string,
  suffix: string,
): Line[] {
  const path = project.sheets[entry.sheet]?.path ?? '';
  return rangesOf(entry.positions).map((range, position) => ({
    sheet: entry.sheet,
    order,
    position,
    text: `${path}!${range} ${suffix}`,
  }));
}

/** References to workbooks or sheets that are not there, then the dynamic references. */
export function addUnresolvedAndDynamic(
  file: TextFile,
  project: Project,
  findings: Findings,
): void {
  file.section('## Unresolved and dynamic references');
  const lines: Line[] = [];
  for (const entry of findings.unresolved.values()) {
    lines.push(...linesOf(project, entry, `0${entry.message}`, entry.message));
  }
  for (const entry of findings.dynamic.values()) {
    lines.push(...linesOf(project, entry, `1${entry.fn}`, `${entry.fn} is a dynamic reference`));
  }
  lines.sort(
    (a, b) => a.sheet - b.sheet || a.order.localeCompare(b.order) || a.position - b.position,
  );
  for (const line of lines) file.add(line.text);
  if (lines.length === 0) file.add('None.');
}
