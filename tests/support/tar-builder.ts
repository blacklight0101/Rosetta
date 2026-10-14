import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);

// RF-127: a hand-written ustar writer for hostile archives built in memory, in the shape of
// scripts/make-snapshot-fixtures.mjs. An entry may declare a size other than its body, and bytes
// may follow the end-of-archive blocks, so a test can build a zip bomb or a lying header.

const BLOCK = 512;

export const TAR_TYPE = {
  file: '0',
  directory: '5',
  fifo: '6',
  paxHeader: 'x',
} as const;

export interface TarEntry {
  readonly path: string;
  readonly type?: string;
  readonly body?: Buffer;
  /** The size the header declares; defaults to the body's length. */
  readonly declaredSize?: number;
}

export interface TarOptions {
  /** Bytes appended after the two end-of-archive blocks. */
  readonly trailing?: Buffer;
  /** Leave out the end-of-archive blocks (an archive cut off after its last entry). */
  readonly noEnd?: boolean;
}

/** The top-level folder GitHub puts every entry under (stripped by the extractor). */
export const TAR_TOP = 'octo-demo-3f78685';

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

function header(entry: TarEntry, size: number): Buffer {
  const buffer = Buffer.alloc(BLOCK);
  buffer.write(entry.path, 0, 100, 'utf8');
  buffer.write(octal(0o644, 8), 100, 8, 'ascii');
  buffer.write(octal(0, 8), 108, 8, 'ascii');
  buffer.write(octal(0, 8), 116, 8, 'ascii');
  buffer.write(octal(size, 12), 124, 12, 'ascii');
  buffer.write(octal(0, 12), 136, 12, 'ascii');
  buffer.write('        ', 148, 8, 'ascii');
  buffer.write(entry.type ?? TAR_TYPE.file, 156, 1, 'ascii');
  buffer.write('ustar\0', 257, 6, 'ascii');
  buffer.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of buffer) sum += byte;
  buffer.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return buffer;
}

function padded(body: Buffer): Buffer[] {
  const padding = (BLOCK - (body.length % BLOCK)) % BLOCK;
  return padding === 0 ? [body] : [body, Buffer.alloc(padding)];
}

/** The uncompressed tar stream of `entries`. */
export function tarBytes(entries: readonly TarEntry[], options: TarOptions = {}): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const body = entry.body ?? Buffer.alloc(0);
    parts.push(header(entry, entry.declaredSize ?? body.length), ...padded(body));
  }
  if (options.noEnd !== true) parts.push(Buffer.alloc(BLOCK * 2));
  if (options.trailing !== undefined) parts.push(options.trailing);
  return Buffer.concat(parts);
}

/** The gzipped archive of `entries`, as GitHub would serve it. */
export function tarGz(entries: readonly TarEntry[], options: TarOptions = {}): Promise<Buffer> {
  return gzipAsync(tarBytes(entries, options), { level: 9 });
}

/** A regular file under the top-level folder. */
export function tarFile(path: string, content: string | Buffer): TarEntry {
  return { path: `${TAR_TOP}/${path}`, body: Buffer.from(content) };
}

/** A web stream of `bytes`, as `fetch` hands a response body over. */
export function streamOf(bytes: Buffer): ReadableStream<Uint8Array> {
  return new Response(new Uint8Array(bytes)).body ?? new ReadableStream();
}
