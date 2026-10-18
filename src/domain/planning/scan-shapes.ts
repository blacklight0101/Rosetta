import type { Encoding, FileKind, LineEnding, MeasuredFile } from './file-facts.js';

// RF-632, DEC-135: skeleton.

export interface KindTotal {
  readonly kind: FileKind;
  readonly files: number;
  readonly bytes: number;
}

export interface ScanShapes {
  readonly files: number;
  readonly totalBytes: number;
  readonly unreadable: number;
  readonly largest: readonly MeasuredFile[];
  readonly byKind: readonly KindTotal[];
  readonly deepest: readonly { readonly path: string; readonly depth: number }[];
  readonly unusualNames: readonly { readonly path: string; readonly reasons: readonly string[] }[];
  readonly encodings: readonly { readonly name: Encoding; readonly files: number }[];
  readonly lineEndings: readonly { readonly name: LineEnding; readonly files: number }[];
}

export const emptyShapes: ScanShapes = {
  files: 0,
  totalBytes: 0,
  unreadable: 0,
  largest: [],
  byKind: [],
  deepest: [],
  unusualNames: [],
  encodings: [],
  lineEndings: [],
};

export function shapesOf(
  files: readonly MeasuredFile[],
  refusedNames: readonly string[],
  unreadable: number,
): ScanShapes {
  return { ...emptyShapes, unreadable: files.length + refusedNames.length < 0 ? unreadable : 0 };
}
