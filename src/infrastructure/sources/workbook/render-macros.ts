import type { MacroModule, MacroProject } from './macro-model.js';
import { TextFile, type ByteBudget } from './render-output.js';
import { allocateSegments } from './workbook-segments.js';
import { splitText } from './workbook-text.js';

// RF-154, RF-152, Q-40, RFC-005 sections 4.4 and 4.6: the VBA source of a workbook written as text.
// A module with source becomes `macros/<Module>.bas` (standard) or `.cls` (class, sheet, workbook and
// form modules). Every line of a file starts with its number (`L12 | `), a long line continues on
// lines that repeat the prefix, and nothing is cut. A module without source (a locked project,
// compiled code only, a damaged stream) is listed in `workbook.md` and gets no file.

/** The escaped characters of one piece of a source line, so a line stays well under 1,900. */
const LINE_CHUNK = 1700;

export type MacroStatus = 'written' | 'locked' | 'no-source' | 'unreadable';

interface MacroEntry {
  readonly module: MacroModule;
  /** The file name below `macros/` (`Module1.bas`), or undefined when the module has no file. */
  readonly file?: string;
  readonly lines: number;
  readonly status: MacroStatus;
}

export interface RenderedMacros {
  /** Paths relative to the workbook folder, `macros/Module1.bas`. */
  readonly files: readonly { readonly path: string; readonly content: string }[];
  readonly entries: readonly MacroEntry[];
  readonly written: number;
  readonly skipped: number;
}

const NONE: RenderedMacros = { files: [], entries: [], written: 0, skipped: 0 };

function sourceFile(text: string, budget: ByteBudget): { content: string; lines: number } {
  const file = new TextFile(budget);
  const lines = text === '' ? [] : text.split(/\r\n|\r|\n/u);
  lines.forEach((line, index) => {
    const prefix = `L${String(index + 1)} | `;
    for (const piece of splitText(line, LINE_CHUNK, false)) file.add(`${prefix}${piece}`);
  });
  return { content: file.text(), lines: lines.length };
}

function entryOf(
  module: MacroModule,
  segment: string,
  budget: ByteBudget,
): { entry: MacroEntry; content?: string } {
  if (module.source.status !== 'text') {
    return { entry: { module, lines: 0, status: module.source.status } };
  }
  const { content, lines } = sourceFile(module.source.text, budget);
  const file = `${segment}.${module.extension}`;
  return { entry: { module, file, lines, status: 'written' }, content };
}

export function renderMacros(
  project: MacroProject | undefined,
  budget: ByteBudget,
): RenderedMacros {
  if (project === undefined) return NONE;
  const segments = allocateSegments(project.modules.map((module) => module.name));
  const files: { path: string; content: string }[] = [];
  const entries: MacroEntry[] = [];
  project.modules.forEach((module, index) => {
    const { entry, content } = entryOf(module, segments[index] ?? '_', budget);
    entries.push(entry);
    if (entry.file !== undefined && content !== undefined) {
      files.push({ path: `macros/${entry.file}`, content });
    }
  });
  const written = files.length;
  return { files, entries, written, skipped: entries.length - written };
}
