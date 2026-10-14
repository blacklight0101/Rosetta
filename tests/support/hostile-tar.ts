import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { Header } from 'tar';

const gzipAsync = promisify(gzip);

export type HostileEntryType = 'File' | 'Directory' | 'FIFO' | 'CharacterDevice' | 'BlockDevice';

export interface HostileEntry {
  readonly path: string;
  readonly type: HostileEntryType;
  readonly content?: string;
}

/** The folder GitHub puts every entry under; the extractor strips it. */
export const TOP = 'octo-demo-3f78685';

/** A plain file under the top folder. */
export function plainFile(path: string, content = 'ok\n'): HostileEntry {
  return { path: `${TOP}/${path}`, type: 'File', content };
}

/** An entry whose path is written exactly as given, so a hostile name reaches the extractor unchanged. */
export function rawEntry(path: string, type: HostileEntryType = 'File'): HostileEntry {
  return { path, type, content: type === 'File' ? 'must never be written\n' : undefined };
}

function encode(entry: HostileEntry): Buffer[] {
  const data = Buffer.from(entry.content ?? '', 'utf8');
  const header = new Header({
    path: entry.path,
    type: entry.type,
    size: data.length,
    mode: entry.type === 'Directory' ? 0o755 : 0o644,
    mtime: new Date(0),
  });
  header.encode();
  const padding = (512 - (data.length % 512)) % 512;
  return data.length === 0
    ? [header.block ?? Buffer.alloc(512)]
    : [header.block ?? Buffer.alloc(512), data, Buffer.alloc(padding)];
}

/** A gzipped tarball of the given entries, built in memory so it exists on every operating system. */
export async function hostileTarball(entries: readonly HostileEntry[]): Promise<Buffer> {
  const blocks = entries.flatMap(encode);
  return gzipAsync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
