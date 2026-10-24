import type { FileEntry } from '../code-map/file-entry.js';
import { isThirdPartyFile } from '../code-map/third-party.js';

// RF-632, DEC-135, ADR-018: the facts the package measures from one file of the scan: its kind, its
// encoding, its line endings and whether its name is one some systems refuse. Pure functions of the
// listed file and its bytes, so the same scan always gives the same facts.

export type FileKind =
  | 'source'
  | 'data and configuration'
  | 'documentation'
  | 'generated map'
  | 'bundled third-party script'
  | 'binary'
  | 'other';

export type Encoding =
  | 'empty'
  | 'ASCII'
  | 'UTF-8'
  | 'UTF-8 with BOM'
  | 'UTF-16 LE'
  | 'UTF-16 BE'
  | 'legacy 8-bit'
  | 'binary';

export type LineEnding = 'LF' | 'CRLF' | 'CR' | 'mixed' | 'single line';

export interface MeasuredFile {
  readonly path: string;
  readonly kind: FileKind;
  readonly bytes: number;
  /** Undefined when the file was too large to be read. */
  readonly encoding: Encoding | undefined;
  /** Undefined when the file was not read, is empty or is binary. */
  readonly lineEnding: LineEnding | undefined;
}

const DATA_LANGUAGES: ReadonlySet<string> = new Set(['xml', 'json', 'yaml', 'toml', 'ini']);
const DOCUMENT_LANGUAGES: ReadonlySet<string> = new Set(['markdown', 'text']);

function startsWith(bytes: Uint8Array, ...prefix: number[]): boolean {
  return prefix.every((value, at) => bytes[at] === value);
}

function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** The encoding a file is written in, from its byte order mark and its bytes. */
// RF-632
export function encodingOf(bytes: Uint8Array): Encoding {
  if (bytes.length === 0) return 'empty';
  if (startsWith(bytes, 0xff, 0xfe)) return 'UTF-16 LE';
  if (startsWith(bytes, 0xfe, 0xff)) return 'UTF-16 BE';
  if (startsWith(bytes, 0xef, 0xbb, 0xbf)) return 'UTF-8 with BOM';
  if (bytes.includes(0)) return 'binary';
  if (bytes.every((value) => value < 0x80)) return 'ASCII';
  return isUtf8(bytes) ? 'UTF-8' : 'legacy 8-bit';
}

function decoded(bytes: Uint8Array, encoding: Encoding): string {
  if (encoding === 'UTF-16 LE') return new TextDecoder('utf-16le').decode(bytes);
  if (encoding === 'UTF-16 BE') return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder(encoding === 'legacy 8-bit' ? 'windows-1252' : 'utf-8').decode(bytes);
}

/** The line ending a text file uses; `mixed` when it uses more than one. */
// RF-632
export function lineEndingOf(bytes: Uint8Array, encoding: Encoding): LineEnding | undefined {
  if (encoding === 'binary' || encoding === 'empty') return undefined;
  const text = decoded(bytes, encoding);
  const crlf = (text.match(/\r\n/gu) ?? []).length;
  const lf = (text.match(/\n/gu) ?? []).length - crlf;
  const cr = (text.match(/\r/gu) ?? []).length - crlf;
  const used = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  if (used === 0) return 'single line';
  if (used > 1) return 'mixed';
  return crlf > 0 ? 'CRLF' : lf > 0 ? 'LF' : 'CR';
}

/** The kind of a listed file, for the size by kind. */
// RF-632
export function kindOf(entry: FileEntry): FileKind {
  if (entry.path.toLowerCase().endsWith('.map')) return 'generated map';
  if (entry.skipped === 'binary') return 'binary';
  if (isThirdPartyFile(entry)) return 'bundled third-party script';
  if (DATA_LANGUAGES.has(entry.language)) return 'data and configuration';
  if (DOCUMENT_LANGUAGES.has(entry.language)) return 'documentation';
  return entry.language === 'unknown' ? 'other' : 'source';
}

const RESERVED = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/iu;
const REFUSED_CHARACTERS = '<>:"|?*';
const FIRST_PRINTABLE = 0x20;
const LAST_ASCII = 0x7f;
const MAX_PATH = 260;

function hasCharacter(text: string, test: (code: number, char: string) => boolean): boolean {
  return Array.from({ length: text.length }, (_none, at) => at).some((at) =>
    test(text.charCodeAt(at), text.charAt(at)),
  );
}

function reservedSegment(segment: string): boolean {
  return RESERVED.test(segment.split('.')[0] ?? '');
}

function refusedSegment(segment: string): boolean {
  const refused = hasCharacter(
    segment,
    (code, char) => code < FIRST_PRINTABLE || REFUSED_CHARACTERS.includes(char),
  );
  return refused || segment.endsWith('.') || segment.endsWith(' ');
}

/** Why a path would trouble some systems: reserved device names, refused characters, length. */
// RF-632
export function unusualNameReasons(path: string): string[] {
  const segments = path.split('/');
  const reasons = [
    segments.some(reservedSegment) ? 'reserved device name' : '',
    segments.some(refusedSegment) ? 'character or ending some systems refuse' : '',
    path.length > MAX_PATH ? 'path over 260 characters' : '',
    hasCharacter(path, (code) => code > LAST_ASCII) ? 'non-ASCII name' : '',
  ];
  return reasons.filter((reason) => reason !== '');
}

/** The facts of one listed file; `bytes` is undefined when it was too large to be read. */
// RF-632
export function measuredFile(
  entry: FileEntry,
  size: number,
  bytes: Uint8Array | undefined,
): MeasuredFile {
  const encoding = bytes === undefined ? undefined : encodingOf(bytes);
  const lineEnding =
    bytes === undefined || encoding === undefined ? undefined : lineEndingOf(bytes, encoding);
  return { path: entry.path, kind: kindOf(entry), bytes: size, encoding, lineEnding };
}
