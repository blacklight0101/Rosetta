import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ZipFile } from 'yazl';

// P3-37: zip fixtures are built inside the tests with yazl; nothing is committed. Hostile ones
// start as a valid zip and are patched in memory (a name, a flag, a size) because yazl refuses to
// write what the extractor must refuse to read.

export interface ZipItem {
  readonly name: string;
  readonly data?: string | Buffer;
  /** Unix mode bits, for example `0o120777` for a symbolic link. */
  readonly mode?: number;
  /** False stores the entry; the default deflates it. */
  readonly compress?: boolean;
  /** True adds an empty directory entry instead of a file. */
  readonly directory?: boolean;
}

export interface ZipOptions {
  readonly zip64?: boolean;
}

function collect(zip: ZipFile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

export function buildZip(items: readonly ZipItem[], options: ZipOptions = {}): Promise<Buffer> {
  const zip = new ZipFile();
  const zip64 = options.zip64 ?? false;
  for (const item of items) {
    if (item.directory === true) {
      zip.addEmptyDirectory(item.name);
      continue;
    }
    zip.addBuffer(Buffer.from(item.data ?? ''), item.name, {
      compress: item.compress ?? true,
      forceZip64Format: zip64,
      ...(item.mode === undefined ? {} : { mode: item.mode }),
    });
  }
  const done = collect(zip);
  zip.end({ forceZip64Format: zip64, comment: '' });
  return done;
}

function placeholderFor(index: number, byteLength: number): Buffer {
  const head = `~${String(index)}`;
  if (byteLength < head.length) throw new Error(`The name is too short for a fixture: ${head}`);
  return Buffer.from(head.padEnd(byteLength, 'z'));
}

function replaceAll(source: Buffer, from: Buffer, to: Buffer): Buffer {
  const result = Buffer.from(source);
  for (let at = result.indexOf(from); at !== -1; at = result.indexOf(from, at + to.length)) {
    to.copy(result, at);
  }
  return result;
}

/**
 * A zip whose entry names are exactly `items[].name`, whatever yazl would accept: it writes
 * placeholders of the same byte length and replaces them in the local and central headers.
 */
export async function buildRawNameZip(items: readonly ZipItem[]): Promise<Buffer> {
  const names = items.map((item) => Buffer.from(item.name, 'utf8'));
  const placeholders = names.map((name, index) => placeholderFor(index, name.length));
  const zip = await buildZip(
    items.map((item, index) => ({ ...item, name: placeholders[index]?.toString() ?? '' })),
  );
  return placeholders.reduce(
    (bytes, placeholder, index) => replaceAll(bytes, placeholder, names[index] ?? placeholder),
    zip,
  );
}

const CENTRAL_SIGNATURE = 0x02014b50;
const NAME_LENGTH_AT = 28;
const EXTRA_LENGTH_AT = 30;
const COMMENT_LENGTH_AT = 32;
const NAME_AT = 46;

export interface CentralPatch {
  readonly versionMadeBy?: number;
  readonly flags?: number;
  readonly method?: number;
  readonly compressedSize?: number;
  readonly uncompressedSize?: number;
}

/** Offsets of the fields in a central directory file header. */
const FIELD_AT = {
  versionMadeBy: 4,
  flags: 8,
  method: 10,
  compressedSize: 20,
  uncompressedSize: 24,
} as const;

/** Rewrites fields of the named entry in the central directory only; the local header stays. */
export function patchCentral(zip: Buffer, name: string, patch: CentralPatch): Buffer {
  const bytes = Buffer.from(zip);
  for (let at = 0; at + NAME_AT <= bytes.length;) {
    if (bytes.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
      at += 1;
      continue;
    }
    const nameLength = bytes.readUInt16LE(at + NAME_LENGTH_AT);
    const entryName = bytes.subarray(at + NAME_AT, at + NAME_AT + nameLength).toString('utf8');
    if (entryName === name) {
      if (patch.versionMadeBy !== undefined)
        bytes.writeUInt16LE(patch.versionMadeBy, at + FIELD_AT.versionMadeBy);
      if (patch.flags !== undefined) bytes.writeUInt16LE(patch.flags, at + FIELD_AT.flags);
      if (patch.method !== undefined) bytes.writeUInt16LE(patch.method, at + FIELD_AT.method);
      if (patch.compressedSize !== undefined)
        bytes.writeUInt32LE(patch.compressedSize, at + FIELD_AT.compressedSize);
      if (patch.uncompressedSize !== undefined)
        bytes.writeUInt32LE(patch.uncompressedSize, at + FIELD_AT.uncompressedSize);
      return bytes;
    }
    at +=
      NAME_AT +
      nameLength +
      bytes.readUInt16LE(at + EXTRA_LENGTH_AT) +
      bytes.readUInt16LE(at + COMMENT_LENGTH_AT);
  }
  throw new Error(`No central directory entry named ${name}`);
}

/** Writes `bytes` to `<dir>/<fileName>` and returns the path. */
export async function writeZipFile(dir: string, fileName: string, bytes: Buffer): Promise<string> {
  const path = join(dir, fileName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return path;
}
