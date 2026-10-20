import { extractReferences, type SheetScope } from './formula-references.js';
import type { Project, SheetNode, WorkbookNode } from './dependency-project.js';
import type { RefBox } from './reference-box.js';
import type { DefinedName } from './workbook-model.js';
import { NAME_CAP, quoteText } from './workbook-text.js';

// RF-153, Q-38: which workbook and sheets a reference means. An external reference is resolved by
// file name, case ignored, against the workbooks of the project; the folder is never kept. A
// reference that cannot be resolved comes back with the sentence `dependencies.md` writes for it.

export interface Resolved {
  /** The workbook the reference reads, when it was found. */
  readonly book?: WorkbookNode;
  readonly sheets: readonly SheetNode[];
  /** Why part of the reference could not be resolved. */
  readonly missing?: string;
}

const q = (text: string): string => quoteText(text, NAME_CAP);

function bookOf(
  project: Project,
  own: WorkbookNode,
  scope: SheetScope,
): Resolved & { name?: string } {
  const ref = scope.book;
  if (ref === undefined) return { book: own, sheets: [] };
  if ('index' in ref && ref.index === 0) return { book: own, sheets: [] };
  const file = 'index' in ref ? own.linkNames[ref.index - 1] : ref.name;
  if (file === undefined) {
    const note = `reads an external link (number ${String('index' in ref ? ref.index : 0)}) that the workbook does not list`;
    return { sheets: [], missing: note };
  }
  const book = project.byFileName.get(file.toLowerCase());
  if (book === undefined) {
    return { sheets: [], missing: `reads the workbook ${q(file)}, which is not uploaded` };
  }
  return { book, sheets: [] };
}

function missingSheet(sheet: string, book: WorkbookNode, own: WorkbookNode): string {
  if (book === own) return `reads the sheet ${q(sheet)}, which the workbook does not have`;
  return `reads the sheet ${q(sheet)} of the workbook ${q(book.model.fileName)}, which does not have it`;
}

/** The sheets a scope names, as seen from a formula on `from`. */
export function resolveScope(project: Project, from: SheetNode, scope: SheetScope): Resolved {
  const own = project.workbooks[from.workbook];
  if (own === undefined) return { sheets: [] };
  const found = bookOf(project, own, scope);
  const book = found.book;
  if (book === undefined) return found;
  if (scope.first === undefined) return { book, sheets: book === own ? [from] : [] };
  const first = book.sheetByName.get(scope.first.toLowerCase());
  const last = scope.last === undefined ? first : book.sheetByName.get(scope.last.toLowerCase());
  if (first === undefined)
    return { book, sheets: [], missing: missingSheet(scope.first, book, own) };
  if (last === undefined) {
    return { book, sheets: [], missing: missingSheet(scope.last ?? '', book, own) };
  }
  const low = Math.min(first.local, last.local);
  return { book, sheets: book.sheets.slice(low, Math.max(first.local, last.local) + 1) };
}

export interface NameTargets {
  readonly boxes: readonly { readonly sheet: SheetNode; readonly box: RefBox }[];
  /** The dynamic functions the name's target holds. */
  readonly dynamic: readonly string[];
}

/** A name that refers to more cells than this is cut; the full text of its target is still written. */
const MAX_NAME_TARGETS = 64;
/** The targets found so far, per project: a node of one project is never handed to another. */
const caches = new WeakMap<Project, Map<DefinedName, NameTargets>>();

/** The cells a defined name refers to, found by reading its target text like a formula. */
export function nameTargets(project: Project, book: WorkbookNode, name: DefinedName): NameTargets {
  const cache = caches.get(project) ?? new Map<DefinedName, NameTargets>();
  caches.set(project, cache);
  const known = cache.get(name);
  if (known !== undefined) return known;
  const result = readTarget(project, book, name);
  cache.set(name, result);
  return result;
}

function readTarget(project: Project, book: WorkbookNode, name: DefinedName): NameTargets {
  const local =
    name.sheet === undefined ? undefined : book.sheetByName.get(name.sheet.toLowerCase());
  const from = local ?? book.sheets[0];
  const boxes: { sheet: SheetNode; box: RefBox }[] = [];
  const dynamic = new Set<string>();
  if (from === undefined) return { boxes, dynamic: [] };
  for (const ref of extractReferences(name.refersTo).references) {
    if (ref.kind === 'dynamic') dynamic.add(ref.fn);
    if (ref.kind !== 'range') continue;
    for (const sheet of resolveScope(project, from, ref.scope).sheets) {
      if (boxes.length < MAX_NAME_TARGETS) boxes.push({ sheet, box: ref.box });
    }
  }
  return { boxes, dynamic: [...dynamic] };
}
