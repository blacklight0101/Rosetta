// RF-154, RFC-005 section 4.6: what the reader returns for the VBA project of an `.xlsm`. The
// macros are text and nothing more; no part of the model can be run.

export type MacroModuleKind = 'standard' | 'class' | 'document' | 'form';

export type MacroSource =
  | { readonly status: 'text'; readonly text: string }
  /** Only compiled code is present: the module is named, there is no source to write. */
  | { readonly status: 'no-source' }
  /** The project is locked for viewing (Q-40): the module is named and skipped. */
  | { readonly status: 'locked' }
  | { readonly status: 'unreadable'; readonly reason: string };

export interface MacroModule {
  /** The module name as the file writes it: not a safe file name, the renderer makes one. */
  readonly name: string;
  readonly kind: MacroModuleKind;
  /** `bas` for a standard module; `cls` for class, sheet, workbook and form modules. */
  readonly extension: 'bas' | 'cls';
  readonly source: MacroSource;
}

export interface FormControl {
  readonly form: string;
  readonly name: string;
  readonly type: string;
}

export interface MacroProject {
  /** `unreadable` is a damaged project: the rest of the workbook is still read. */
  readonly state: 'readable' | 'locked' | 'unreadable';
  readonly name?: string;
  readonly codePage: number;
  /** The text encoding the code page was decoded with. */
  readonly encoding: string;
  readonly modules: readonly MacroModule[];
  readonly formControls: readonly FormControl[];
  /** Why the project is unreadable. */
  readonly reason?: string;
}
