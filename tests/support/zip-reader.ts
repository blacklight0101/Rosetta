import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';

// RF-008: a small zip reader for tests, so the archive is checked by what a person would unzip, not
// by the writer that made it. It reads the central directory and supports stored and deflated
// entries, which is all the writer produces.

export interface ZipEntry {
  readonly name: string;
  readonly directory: boolean;
  readonly data: Buffer;
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const inflate = promisify(inflateRaw);
const STORED = 0;
const DEFLATED = 8;

function endOfDirectory(zip: Buffer): number {
  for (let at = zip.length - 22; at >= 0; at -= 1) {
    if (zip.readUInt32LE(at) === END_OF_DIRECTORY) return at;
  }
  throw new Error('The bytes are not a zip file: no end of central directory');
}

async function dataOf(
  zip: Buffer,
  method: number,
  size: number,
  localOffset: number,
): Promise<Buffer> {
  if (zip.readUInt32LE(localOffset) !== LOCAL_HEADER) throw new Error('Bad local header');
  const start =
    localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
  const packed = zip.subarray(start, start + size);
  if (method === STORED) return packed;
  if (method === DEFLATED) return inflate(packed);
  throw new Error(`Unsupported zip method ${String(method)}`);
}

/** Every entry of the zip, in the order of its central directory. */
export async function readZip(bytes: Uint8Array): Promise<readonly ZipEntry[]> {
  const zip = Buffer.from(bytes);
  const end = endOfDirectory(zip);
  const count = zip.readUInt16LE(end + 10);
  const entries: ZipEntry[] = [];
  let at = zip.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(at) !== DIRECTORY_HEADER) throw new Error('Bad central directory header');
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const directory = name.endsWith('/');
    const data = directory
      ? Buffer.alloc(0)
      : await dataOf(zip, method, size, zip.readUInt32LE(at + 42));
    entries.push({ name, directory, data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The whole body of a byte stream. */
export async function collectBytes(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** The files of the zip as `name -> text`, directories left out. */
export function filesOf(entries: readonly ZipEntry[]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    entries
      .filter((entry) => !entry.directory)
      .map((entry) => [entry.name, entry.data.toString('utf8')]),
  );
}
