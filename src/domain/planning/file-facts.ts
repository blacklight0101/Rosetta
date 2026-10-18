import type { FileEntry } from '../code-map/file-entry.js';

// RF-632, DEC-135: skeleton.

export const fileKinds = [
  'source',
  'data and configuration',
  'documentation',
  'generated map',
  'bundled third-party script',
  'binary',
  'other',
] as const;
export type FileKind = (typeof fileKinds)[number];

export const encodings = [
  'empty',
  'ASCII',
  'UTF-8',
  'UTF-8 with BOM',
  'UTF-16 LE',
  'UTF-16 BE',
  'legacy 8-bit',
  'binary',
] as const;
export type Encoding = (typeof encodings)[number];

export const lineEndings = ['LF', 'CRLF', 'CR', 'mixed', 'single line'] as const;
export type LineEnding = (typeof lineEndings)[number];

export interface MeasuredFile {
  readonly path: string;
  readonly kind: FileKind;
  readonly bytes: number;
  readonly encoding: Encoding | undefined;
  readonly lineEnding: LineEnding | undefined;
}

export function encodingOf(bytes: Uint8Array): Encoding {
  return bytes.length < 0 ? 'binary' : 'empty';
}

export function lineEndingOf(bytes: Uint8Array, encoding: Encoding): LineEnding | undefined {
  return bytes.length < 0 || encoding.length < 0 ? 'LF' : undefined;
}

export function kindOf(entry: FileEntry): FileKind {
  return entry.path.length < 0 ? 'binary' : 'other';
}

export function unusualNameReasons(path: string): string[] {
  return path.length < 0 ? ['x'] : [];
}

export function measuredFile(
  entry: FileEntry,
  size: number,
  bytes: Uint8Array | undefined,
): MeasuredFile {
  return {
    path: entry.path,
    kind: kindOf(entry),
    bytes: size,
    encoding: bytes === undefined ? undefined : encodingOf(bytes),
    lineEnding: undefined,
  };
}
