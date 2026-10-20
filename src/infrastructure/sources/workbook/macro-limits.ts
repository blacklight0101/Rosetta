// RF-154: bounds on a VBA project. Every size, count and offset in a compound file is chosen by
// whoever made the file, so each one is checked against these before memory is allocated.

export interface MacroLimits {
  /** `xl/vbaProject.bin` as stored in the package. */
  readonly maxProjectBytes: number;
  /** Modules listed in the `dir` stream. */
  readonly maxModules: number;
  /** The `dir` stream once decompressed. */
  readonly maxDirBytes: number;
  /** One module's source once decompressed. */
  readonly maxModuleBytes: number;
  /** All sources of a project once decompressed. */
  readonly maxSourceBytes: number;
  /** A small side stream (`PROJECT`, a form's `VBFrame`). */
  readonly maxTextStreamBytes: number;
  /** Controls listed across all forms. */
  readonly maxControls: number;
}

export const DEFAULT_MACRO_LIMITS: MacroLimits = {
  maxProjectBytes: 32 * 1024 * 1024,
  maxModules: 1000,
  maxDirBytes: 4 * 1024 * 1024,
  maxModuleBytes: 4 * 1024 * 1024,
  maxSourceBytes: 16 * 1024 * 1024,
  maxTextStreamBytes: 1024 * 1024,
  maxControls: 5000,
};
